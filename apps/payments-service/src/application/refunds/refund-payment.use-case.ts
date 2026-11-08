import { randomUUID } from 'node:crypto';
import { DomainError } from '../../domain/shared/domain-error';
import { Money } from '../../domain/shared/money';
import { Refund } from '../../domain/refunds/refund.entity';
import { REFUND_REASONS, type RefundReason, type RefundStatus } from '../../domain/refunds/refund.policy';
import type { ClockPort } from '../ports/clock.port';
import type { IdempotencyRecord } from '../ports/idempotency.repository';
import type { PaymentGatewayPort, RefundResult } from '../ports/payment-gateway.port';
import type { UnitOfWork } from '../ports/unit-of-work';
import type { PaymentsConfig } from '../../infrastructure/config/payments-config';
import { requestFingerprint } from '../../infrastructure/security/request-fingerprint';
import type { RefundUnitOfWorkRepositories } from '../../infrastructure/persistence/prisma/unit-of-work';
import { refundFailedPaymentEvent, refundedPaymentEvent } from '../events/payment-events';

export interface RefundPaymentInput {
  readonly paymentId: string;
  readonly reason: RefundReason;
  readonly amountMinor?: number;
  readonly idempotencyKey: string;
  readonly callerSubject: string;
}

export interface RefundPaymentResponse {
  readonly id: string;
  readonly paymentId: string;
  readonly amountMinor: number;
  readonly currency: 'COP' | 'USD';
  readonly reason: RefundReason;
  readonly status: RefundStatus;
  readonly failureCode: string | null;
  readonly createdAt: string;
}

export interface RefundPaymentResult {
  readonly statusCode: 201 | 202;
  readonly refund: RefundPaymentResponse;
  readonly replayed: boolean;
}

interface RefundPaymentDependencies {
  readonly unitOfWork: UnitOfWork<RefundUnitOfWorkRepositories>;
  readonly gateway: PaymentGatewayPort;
  readonly clock: ClockPort;
  readonly config: Pick<PaymentsConfig, 'idempotencyTtlHours' | 'maxAmountMinor' | 'reconcilerIntervalMs'>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class RefundPayment {
  constructor(private readonly dependencies: RefundPaymentDependencies) {}

  async execute(input: RefundPaymentInput): Promise<RefundPaymentResult> {
    this.validateInput(input);
    const { unitOfWork, gateway, clock, config } = this.dependencies;
    const scope = `refund:${input.paymentId}`;
    const fingerprint = requestFingerprint({
      paymentId: input.paymentId,
      reason: input.reason,
      amountMinor: input.amountMinor ?? null,
    });
    const refundId = randomUUID();
    const createdAt = clock.now();
    const expiresAt = new Date(createdAt.getTime() + config.idempotencyTtlHours * 60 * 60 * 1_000);
    const reservation: IdempotencyRecord = {
      scope,
      key: input.idempotencyKey,
      callerSubject: input.callerSubject,
      requestFingerprint: fingerprint,
      responseStatus: null,
      responseBody: null,
      resourceId: refundId,
      expiresAt,
    };

    const start = await unitOfWork.transaction(async ({ refunds, idempotency }) => {
      const reserved = await idempotency.reserve(reservation);
      if (!reserved.created) {
        if (reserved.record.requestFingerprint !== fingerprint) {
          throw new DomainError('IDEMPOTENCY_CONFLICT', 'Idempotency key was already used for a different refund request');
        }
        if (reserved.record.responseStatus === null || reserved.record.responseBody === null) {
          throw new DomainError('STATE_CONFLICT', 'The idempotent refund request is still processing');
        }
        const refundResponse = reserved.record.responseBody.refund;
        if (!refundResponse || typeof refundResponse !== 'object') {
          throw new DomainError('STATE_CONFLICT', 'Stored idempotent refund response is invalid');
        }
        return {
          kind: 'replay' as const,
          result: {
            statusCode: reserved.record.responseStatus as 201 | 202,
            refund: refundResponse as RefundPaymentResponse,
            replayed: true,
          },
        };
      }

      const locked = await refunds.lockPaymentForRefund(input.paymentId);
      if (!locked) throw new DomainError('NOT_FOUND', 'Payment was not found');
      if (await refunds.findInFlightByPaymentId(input.paymentId)) {
        throw new DomainError('STATE_CONFLICT', 'A refund is already in flight for this payment');
      }
      const refund = Refund.create({
        id: refundId,
        paymentId: input.paymentId,
        paymentStatus: locked.payment.status,
        paymentAmount: locked.payment.amount,
        refundedAmount: locked.payment.refundedAmount,
        reason: input.reason,
        ...(input.amountMinor !== undefined
          ? { requestedAmount: Money.fromMinor(input.amountMinor, locked.payment.amount.currency, config.maxAmountMinor) }
          : {}),
      });
      await refunds.save(refund, {
        actor: input.callerSubject,
        nextReconcileAt: new Date(createdAt.getTime() + config.reconcilerIntervalMs),
      });
      return { kind: 'created' as const, refund, paymentReference: locked.gatewayReference ?? '' };
    });

    if (start.kind === 'replay') return start.result;

    let gatewayResult: RefundResult;
    try {
      gatewayResult = await gateway.refund({
        refundId: start.refund.id,
        paymentReference: start.paymentReference,
        amountMinor: start.refund.amount.amountMinor,
        currency: start.refund.amount.currency,
        idempotencyReference: start.refund.id,
      });
    } catch {
      gatewayResult = { kind: 'uncertain' };
    }
    const occurredAt = clock.now();

    if (gatewayResult.kind === 'not-dispatched') {
      start.refund.fail('GATEWAY_UNAVAILABLE', { source: 'gateway-adapter', reference: start.refund.id });
      await unitOfWork.transaction(async ({ refunds, outbox, idempotency }) => {
        const locked = await refunds.lockPaymentForRefund(input.paymentId);
        if (!locked) throw new DomainError('NOT_FOUND', 'Payment was not found');
        await refunds.save(start.refund, {
          actor: 'payments-service',
          reasonCode: 'GATEWAY_UNAVAILABLE',
          nextReconcileAt: null,
        });
        await outbox.append(refundFailedPaymentEvent(locked.payment, start.refund, occurredAt));
        await idempotency.releasePreDispatch(scope, input.idempotencyKey, input.callerSubject, {
          dispatch: 'NOT_DISPATCHED', reason: 'GATEWAY_UNAVAILABLE',
        });
      });
      throw new DomainError('UNAVAILABLE', 'Payment gateway is unavailable before refund dispatch');
    }

    if (gatewayResult.kind === 'uncertain') {
      start.refund.markUncertain({ source: 'gateway-adapter', reference: gatewayResult.reference ?? start.refund.id });
      const response = this.toResponse(start.refund, createdAt);
      await unitOfWork.transaction(async ({ refunds, idempotency }) => {
        await refunds.save(start.refund, {
          gatewayReference: gatewayResult.reference ?? start.refund.id,
          nextReconcileAt: new Date(occurredAt.getTime() + config.reconcilerIntervalMs),
        });
        await idempotency.complete(scope, input.idempotencyKey, input.callerSubject, 202, { refund: response }, start.refund.id);
      });
      return { statusCode: 202, refund: response, replayed: false };
    }

    let result: RefundPaymentResult | undefined;
    await unitOfWork.transaction(async ({ payments, refunds, outbox, idempotency }) => {
      const locked = await refunds.lockPaymentForRefund(input.paymentId);
      if (!locked) throw new DomainError('NOT_FOUND', 'Payment was not found');
      if (gatewayResult.kind === 'completed') {
        start.refund.complete({ source: 'gateway', reference: gatewayResult.reference });
        locked.payment.applyRefund(start.refund.amount, { source: 'gateway', reference: gatewayResult.reference });
        await payments.save(locked.payment, { evidenceReference: gatewayResult.reference });
        await refunds.save(start.refund, {
          gatewayReference: gatewayResult.reference,
          evidenceReference: gatewayResult.reference,
          nextReconcileAt: null,
        });
        await outbox.append(refundedPaymentEvent(locked.payment, start.refund, occurredAt));
      } else {
        start.refund.fail(gatewayResult.failureCode, { source: 'gateway', reference: gatewayResult.reference });
        await refunds.save(start.refund, {
          gatewayReference: gatewayResult.reference,
          evidenceReference: gatewayResult.reference,
          nextReconcileAt: null,
        });
        await outbox.append(refundFailedPaymentEvent(locked.payment, start.refund, occurredAt));
      }
      const response = this.toResponse(start.refund, createdAt);
      result = { statusCode: 201, refund: response, replayed: false };
      await idempotency.complete(scope, input.idempotencyKey, input.callerSubject, 201, { refund: response }, start.refund.id);
    });
    if (!result) throw new DomainError('STATE_CONFLICT', 'Refund result was not committed');
    return result;
  }

  private validateInput(input: RefundPaymentInput): void {
    if (!UUID_PATTERN.test(input.paymentId) || !UUID_PATTERN.test(input.idempotencyKey)) {
      throw new DomainError('VALIDATION_ERROR', 'Payment id and idempotency key must be UUIDs');
    }
    if (!input.callerSubject.trim()) throw new DomainError('VALIDATION_ERROR', 'Caller subject is required');
    if (!REFUND_REASONS.includes(input.reason)) throw new DomainError('VALIDATION_ERROR', 'Unsupported refund reason');
    if (input.amountMinor !== undefined) {
      if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0 || input.amountMinor > this.dependencies.config.maxAmountMinor) {
        throw new DomainError('REFUND_AMOUNT_INVALID', 'Refund amount is outside the supported range');
      }
    }
  }

  private toResponse(refund: Refund, createdAt: Date): RefundPaymentResponse {
    return {
      id: refund.id,
      paymentId: refund.paymentId,
      amountMinor: refund.amount.amountMinor,
      currency: refund.amount.currency,
      reason: refund.reason,
      status: refund.status,
      failureCode: refund.failureCode,
      createdAt: createdAt.toISOString(),
    };
  }
}
