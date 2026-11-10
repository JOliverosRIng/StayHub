import { randomUUID } from 'node:crypto';
import { DomainError } from '../../domain/shared/domain-error';
import { Money } from '../../domain/shared/money';
import { Payment } from '../../domain/payments/payment.entity';
import type { ClockPort } from '../ports/clock.port';
import type { IdempotencyRecord } from '../ports/idempotency.repository';
import type { ChargeResult, PaymentGatewayPort } from '../ports/payment-gateway.port';
import type { UnitOfWork } from '../ports/unit-of-work';
import type { PaymentsConfig } from '../../infrastructure/config/payments-config';
import { requestFingerprint } from '../../infrastructure/security/request-fingerprint';
import { tokenFingerprint } from '../../infrastructure/security/token-fingerprint';
import {
  approvedPaymentEvent,
  declinedPaymentEvent,
  failedPaymentEvent,
} from '../events/payment-events';
import type { PaymentUnitOfWorkRepositories } from '../../infrastructure/persistence/prisma/unit-of-work';

export interface CreatePaymentInput {
  readonly bookingId: string;
  readonly payerUserId: string;
  readonly amountMinor: number;
  readonly currency: 'COP' | 'USD';
  readonly paymentMethod: { readonly type: 'CARD_TOKEN'; readonly token: string };
  readonly idempotencyKey: string;
  readonly callerSubject: string;
}

export interface CreatePaymentResponse {
  readonly id: string;
  readonly bookingId: string;
  readonly payerUserId: string;
  readonly amountMinor: number;
  readonly currency: 'COP' | 'USD';
  readonly status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'FAILED';
  readonly refundedAmountMinor: number;
  readonly failureCode: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreatePaymentResult {
  readonly statusCode: 201 | 202;
  readonly payment: CreatePaymentResponse;
  readonly replayed: boolean;
}

interface CreatePaymentDependencies {
  readonly unitOfWork: UnitOfWork<PaymentUnitOfWorkRepositories>;
  readonly gateway: PaymentGatewayPort;
  readonly clock: ClockPort;
  readonly config: Pick<PaymentsConfig,
    'allowedCurrencies' | 'maxAmountMinor' | 'idempotencyTtlHours' | 'tokenHmacSecret' | 'reconcilerIntervalMs'>;
}

const IDEMPOTENCY_SCOPE = 'charge';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class CreatePayment {
  constructor(private readonly dependencies: CreatePaymentDependencies) {}

  async execute(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    this.validateInput(input);
    const { config, clock, gateway, unitOfWork } = this.dependencies;
    const paymentMethodFingerprint = tokenFingerprint(input.paymentMethod.token, config.tokenHmacSecret);
    const fingerprint = requestFingerprint({
      bookingId: input.bookingId,
      payerUserId: input.payerUserId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      paymentMethod: { type: input.paymentMethod.type, fingerprint: paymentMethodFingerprint },
    });
    const paymentId = randomUUID();
    const createdAt = clock.now();
    const expiresAt = new Date(createdAt.getTime() + config.idempotencyTtlHours * 60 * 60 * 1_000);
    const payment = Payment.create({
      id: paymentId,
      bookingId: input.bookingId,
      payerUserId: input.payerUserId,
      paymentMethodFingerprint,
      amount: Money.fromMinor(input.amountMinor, input.currency, config.maxAmountMinor),
    });
    const reservation: IdempotencyRecord = {
      scope: IDEMPOTENCY_SCOPE,
      key: input.idempotencyKey,
      callerSubject: input.callerSubject,
      requestFingerprint: fingerprint,
      responseStatus: null,
      responseBody: null,
      resourceId: paymentId,
      expiresAt,
    };

    const start = await unitOfWork.transaction(async ({ payments, idempotency }) => {
      const result = await idempotency.reserve(reservation);
      if (!result.created) {
        const existing = result.record;
        if (existing.requestFingerprint !== fingerprint) {
          throw new DomainError('IDEMPOTENCY_CONFLICT', 'Idempotency key was already used for a different request');
        }
        if (existing.responseStatus === null || existing.responseBody === null) {
          throw new DomainError('STATE_CONFLICT', 'The idempotent payment request is still processing');
        }
        const replay = existing.responseBody.payment;
        if (!replay || typeof replay !== 'object') {
          throw new DomainError('STATE_CONFLICT', 'Stored idempotent response is invalid');
        }
        return {
          kind: 'replay' as const,
          result: {
            statusCode: existing.responseStatus as 201 | 202,
            payment: replay as CreatePaymentResponse,
            replayed: true,
          },
        };
      }

      const active = await payments.findActiveByBookingId(input.bookingId);
      if (active) throw new DomainError('STATE_CONFLICT', 'An active payment already exists for this booking');
      await payments.save(payment, {
        nextReconcileAt: new Date(createdAt.getTime() + config.reconcilerIntervalMs),
      });
      return { kind: 'created' as const };
    });
    if (start.kind === 'replay') return start.result;

    let gatewayResult: ChargeResult;
    try {
      gatewayResult = await gateway.charge({
        paymentId,
        token: input.paymentMethod.token,
        amountMinor: input.amountMinor,
        currency: input.currency,
        idempotencyReference: paymentId,
      });
    } catch {
      gatewayResult = { kind: 'uncertain' as const };
    }

    const occurredAt = clock.now();
    if (gatewayResult.kind === 'not-dispatched') {
      payment.markFailed({ dispatch: 'NOT_DISPATCHED', source: 'gateway-adapter', reference: payment.id });
      await unitOfWork.transaction(async ({ payments, outbox, idempotency }) => {
        await payments.save(payment, { nextReconcileAt: null });
        await outbox.append(failedPaymentEvent(payment, occurredAt));
        await idempotency.releasePreDispatch(IDEMPOTENCY_SCOPE, input.idempotencyKey, input.callerSubject, {
          dispatch: 'NOT_DISPATCHED', reason: 'GATEWAY_UNAVAILABLE',
        });
      });
      throw new DomainError('UNAVAILABLE', 'Payment gateway is unavailable before dispatch');
    }

    if (gatewayResult.kind === 'uncertain') {
      payment.markUncertain({ source: 'gateway-adapter', reference: gatewayResult.reference ?? payment.id });
      const response = this.toResponse(payment, createdAt, occurredAt);
      const result: CreatePaymentResult = { statusCode: 202, payment: response, replayed: false };
      await unitOfWork.transaction(async ({ payments, idempotency }) => {
        await payments.save(payment, {
          gatewayReference: gatewayResult.reference ?? payment.id,
          nextReconcileAt: new Date(occurredAt.getTime() + config.reconcilerIntervalMs),
        });
        await idempotency.complete(
          IDEMPOTENCY_SCOPE, input.idempotencyKey, input.callerSubject, 202, { payment: response }, payment.id,
        );
      });
      return result;
    }

    if (gatewayResult.kind === 'approved') {
      payment.approve({ source: 'gateway', reference: gatewayResult.reference });
    } else {
      payment.decline(gatewayResult.failureCode, { source: 'gateway', reference: gatewayResult.reference });
    }
    const response = this.toResponse(payment, createdAt, occurredAt);
    const result: CreatePaymentResult = { statusCode: 201, payment: response, replayed: false };
    const paymentEvent = gatewayResult.kind === 'approved'
      ? approvedPaymentEvent(payment, occurredAt)
      : declinedPaymentEvent(payment, occurredAt, gatewayResult.failureCode);
    await unitOfWork.transaction(async ({ payments, outbox, idempotency }) => {
      await payments.save(payment, {
        gatewayReference: gatewayResult.reference,
        evidenceReference: gatewayResult.reference,
        nextReconcileAt: null,
      });
      await outbox.append(paymentEvent);
      await idempotency.complete(
        IDEMPOTENCY_SCOPE, input.idempotencyKey, input.callerSubject, 201, { payment: response }, payment.id,
      );
    });
    return result;
  }

  private validateInput(input: CreatePaymentInput): void {
    const { config } = this.dependencies;
    if (!UUID_PATTERN.test(input.bookingId) || !UUID_PATTERN.test(input.payerUserId)) {
      throw new DomainError('VALIDATION_ERROR', 'Booking and payer identifiers must be UUIDs');
    }
    if (!UUID_PATTERN.test(input.idempotencyKey)) {
      throw new DomainError('VALIDATION_ERROR', 'Idempotency key must be a UUID');
    }
    if (!input.callerSubject.trim()) throw new DomainError('VALIDATION_ERROR', 'Caller subject is required');
    if (!config.allowedCurrencies.includes(input.currency)) {
      throw new DomainError('VALIDATION_ERROR', 'Currency is not enabled');
    }
    if (input.paymentMethod.type !== 'CARD_TOKEN') {
      throw new DomainError('VALIDATION_ERROR', 'Unsupported payment method');
    }
    if (/^\d{13,19}$/.test(input.paymentMethod.token)) {
      throw new DomainError('VALIDATION_ERROR', 'Card numbers are not accepted');
    }
    Money.fromMinor(input.amountMinor, input.currency, config.maxAmountMinor);
  }

  private toResponse(payment: Payment, createdAt: Date, updatedAt: Date): CreatePaymentResponse {
    const status = payment.status;
    if (status !== 'PENDING' && status !== 'APPROVED' && status !== 'DECLINED' && status !== 'FAILED') {
      throw new DomainError('STATE_CONFLICT', 'Payment status cannot be returned by the create operation');
    }
    return {
      id: payment.id,
      bookingId: payment.bookingId,
      payerUserId: payment.payerUserId,
      amountMinor: payment.amount.amountMinor,
      currency: payment.amount.currency,
      status,
      refundedAmountMinor: payment.refundedAmount.amountMinor,
      failureCode: payment.failureCode,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    };
  }
}
