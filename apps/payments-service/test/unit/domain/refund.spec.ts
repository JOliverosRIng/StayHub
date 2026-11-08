import { DomainError } from '../../../src/domain/shared/domain-error';
import { Money } from '../../../src/domain/shared/money';
import { Refund } from '../../../src/domain/refunds/refund.entity';
import {
  assertRefundStatusTransition,
  calculateRefundAmount,
  canTransitionRefundStatus,
  type RefundReason,
  type RefundStatus,
} from '../../../src/domain/refunds/refund.policy';

const evidence = { source: 'gateway', reference: 'refund-operation-1' };
const approved = Money.fromMinor(1_000, 'COP');
const refunded = Money.fromMinor(200, 'COP');

describe('RefundPolicy', () => {
  it('uses the full refundable balance when amount is omitted', () => {
    expect(calculateRefundAmount('APPROVED', approved, refunded, 'GUEST_CANCELLATION').amountMinor).toBe(800);
  });

  it('requires OWNER_CANCELLATION to refund the entire remaining balance', () => {
    expect(
      calculateRefundAmount('APPROVED', approved, refunded, 'OWNER_CANCELLATION').amountMinor,
    ).toBe(800);
    expect(() =>
      calculateRefundAmount('APPROVED', approved, refunded, 'OWNER_CANCELLATION', Money.fromMinor(500, 'COP')),
    ).toThrow(DomainError);
  });

  it.each<RefundReason>(['GUEST_CANCELLATION', 'OWNER_CANCELLATION'])(
    'rejects unsupported payment states for %s',
    (reason) => {
      expect(() => calculateRefundAmount('REVIEW_REQUIRED', approved, refunded, reason)).toThrow(DomainError);
      expect(() => calculateRefundAmount('PENDING', approved, refunded, reason)).toThrow(DomainError);
    },
  );

  it('rejects zero, over-balance, and mixed-currency refunds', () => {
    expect(() => calculateRefundAmount('APPROVED', approved, refunded, 'GUEST_CANCELLATION', Money.fromMinor(0, 'COP'))).toThrow(DomainError);
    expect(() => calculateRefundAmount('APPROVED', approved, refunded, 'GUEST_CANCELLATION', Money.fromMinor(801, 'COP'))).toThrow(DomainError);
    expect(() => calculateRefundAmount('APPROVED', approved, refunded, 'GUEST_CANCELLATION', Money.fromMinor(100, 'USD'))).toThrow(DomainError);
  });

  it('permits only evidenced transitions, with REVIEW_REQUIRED blocking without evidence', () => {
    const transitions: Readonly<Record<RefundStatus, readonly RefundStatus[]>> = {
      PENDING: ['COMPLETED', 'FAILED', 'REVIEW_REQUIRED'],
      REVIEW_REQUIRED: ['COMPLETED', 'FAILED'],
      COMPLETED: [],
      FAILED: [],
    };
    for (const from of Object.keys(transitions) as RefundStatus[]) {
      for (const to of ['PENDING', 'REVIEW_REQUIRED', 'COMPLETED', 'FAILED'] as RefundStatus[]) {
        expect(canTransitionRefundStatus(from, to, evidence)).toBe(transitions[from].includes(to));
      }
    }
    expect(canTransitionRefundStatus('REVIEW_REQUIRED', 'COMPLETED')).toBe(false);
    expect(() => assertRefundStatusTransition('REVIEW_REQUIRED', 'COMPLETED')).toThrow(DomainError);
    expect(() => assertRefundStatusTransition('REVIEW_REQUIRED', 'COMPLETED', evidence)).not.toThrow();
  });
});

describe('Refund', () => {
  it('creates a pending refund with calculated amount and returns an auditable status transition', () => {
    const refund = Refund.create({
      id: 'refund-1',
      paymentId: 'payment-1',
      paymentStatus: 'APPROVED',
      paymentAmount: approved,
      refundedAmount: refunded,
      reason: 'GUEST_CANCELLATION',
    });
    expect(refund.amount.amountMinor).toBe(800);
    expect(refund.status).toBe('PENDING');
    const transition = refund.complete(evidence);
    expect(refund.status).toBe('COMPLETED');
    expect(transition).toMatchObject({ from: 'PENDING', to: 'COMPLETED', evidence });
  });

  it('rejects invalid refund reason at runtime', () => {
    expect(() => Refund.create({
      id: 'refund-1',
      paymentId: 'payment-1',
      paymentStatus: 'APPROVED',
      paymentAmount: approved,
      refundedAmount: refunded,
      reason: 'OTHER' as RefundReason,
    })).toThrow(DomainError);
  });
});
