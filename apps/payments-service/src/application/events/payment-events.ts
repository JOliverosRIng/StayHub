import { randomUUID } from 'node:crypto';
import { DomainError } from '../../domain/shared/domain-error';
import type { Payment } from '../../domain/payments/payment.entity';
import type { PaymentFailureCode } from '../../domain/payments/payment.policy';
import type { NewOutboxEvent } from '../ports/outbox.repository';

function basePayload(payment: Payment, eventId: string, eventType: string, occurredAt: Date): Record<string, unknown> {
  return {
    eventId,
    eventType,
    schemaVersion: 1,
    occurredAt: occurredAt.toISOString(),
    paymentId: payment.id,
    bookingId: payment.bookingId,
    payerUserId: payment.payerUserId,
    amountMinor: payment.amount.amountMinor,
    currency: payment.amount.currency,
  };
}

function event(payment: Payment, eventType: string, payload: Record<string, unknown>, eventId: string): NewOutboxEvent {
  return { id: eventId, aggregateId: payment.id, eventType, payload };
}

export function approvedPaymentEvent(
  payment: Payment,
  occurredAt: Date,
  eventId = randomUUID(),
): NewOutboxEvent {
  if (payment.status !== 'APPROVED') throw new DomainError('STATE_CONFLICT', 'Approval event requires an approved payment');
  const eventType = 'payment.v1.approved';
  return event(payment, eventType, basePayload(payment, eventId, eventType, occurredAt), eventId);
}

export function declinedPaymentEvent(
  payment: Payment,
  occurredAt: Date,
  failureCode: Extract<PaymentFailureCode, 'INSUFFICIENT_FUNDS' | 'CARD_DECLINED' | 'SUSPECTED_FRAUD'>,
  eventId = randomUUID(),
): NewOutboxEvent {
  if (payment.status !== 'DECLINED' || payment.failureCode !== failureCode) {
    throw new DomainError('STATE_CONFLICT', 'Decline event must match the confirmed payment result');
  }
  const eventType = 'payment.v1.declined';
  return event(payment, eventType, { ...basePayload(payment, eventId, eventType, occurredAt), failureCode }, eventId);
}

export function failedPaymentEvent(
  payment: Payment,
  occurredAt: Date,
  eventId = randomUUID(),
): NewOutboxEvent {
  if (payment.status !== 'FAILED' || payment.failureCode !== 'GATEWAY_UNAVAILABLE') {
    throw new DomainError('STATE_CONFLICT', 'Failure event requires confirmed non-dispatch evidence');
  }
  const eventType = 'payment.v1.failed';
  return event(payment, eventType, {
    ...basePayload(payment, eventId, eventType, occurredAt),
    failureCode: 'GATEWAY_UNAVAILABLE',
  }, eventId);
}
