import { DomainError } from '../../../src/domain/shared/domain-error';
import { Money } from '../../../src/domain/shared/money';
import { Payment } from '../../../src/domain/payments/payment.entity';
import type { PaymentStatusEvidence } from '../../../src/domain/payments/payment-status';
import { createPaymentFixture } from '../../fixtures/payments.fixture';

const evidence: PaymentStatusEvidence = { source: 'gateway', reference: 'operation-1' };
const payment = (): Payment => createPaymentFixture(1_000);

describe('Payment', () => {
  it('approves a pending payment with evidence', () => {
    const subject = payment();
    subject.approve(evidence);
    expect(subject.status).toBe('APPROVED');
  });

  it('declines with a stable failure code', () => {
    const subject = payment();
    subject.decline('CARD_DECLINED', evidence);
    expect(subject.status).toBe('DECLINED');
    expect(subject.failureCode).toBe('CARD_DECLINED');
  });

  it('marks failed only with explicit proof that dispatch did not occur', () => {
    const subject = payment();
    expect(() => subject.markFailed({ source: 'gateway', reference: 'op-1' } as never)).toThrow(DomainError);
    subject.markFailed({
      dispatch: 'NOT_DISPATCHED',
      source: 'gateway-adapter',
      reference: 'pre-dispatch-1',
    });
    expect(subject.status).toBe('FAILED');
    expect(subject.failureCode).toBe('GATEWAY_UNAVAILABLE');
  });

  it('escalates uncertain payments to review without declaring failure', () => {
    const subject = payment();
    subject.markReviewRequired({ source: 'reconciler', reference: 'attempts-exhausted' });
    expect(subject.status).toBe('REVIEW_REQUIRED');
    expect(subject.failureCode).toBe('RECONCILIATION_EXHAUSTED');
  });

  it('applies partial and full refunds without exceeding the payment amount', () => {
    const subject = payment();
    subject.approve(evidence);
    subject.applyRefund(Money.fromMinor(400, 'COP'), evidence);
    expect(subject.refundedAmount.amountMinor).toBe(400);
    expect(subject.status).toBe('PARTIALLY_REFUNDED');
    subject.applyRefund(Money.fromMinor(600, 'COP'), evidence);
    expect(subject.refundedAmount.amountMinor).toBe(1_000);
    expect(subject.status).toBe('REFUNDED');
  });

  it('rejects over-refunds, zero refunds, and refunds for unresolved payments', () => {
    const subject = payment();
    expect(() => subject.applyRefund(Money.fromMinor(1, 'COP'), evidence)).toThrow(DomainError);
    subject.approve(evidence);
    expect(() => subject.applyRefund(Money.fromMinor(0, 'COP'), evidence)).toThrow(DomainError);
    expect(() => subject.applyRefund(Money.fromMinor(1_001, 'COP'), evidence)).toThrow(DomainError);
    expect(subject.refundedAmount.amountMinor).toBe(0);
  });
});
