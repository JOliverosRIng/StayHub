import { DomainError } from '../../../src/domain/shared/domain-error';
import {
  assertPaymentStatusTransition,
  canTransitionPaymentStatus,
  PAYMENT_STATUSES,
  type PaymentStatus,
} from '../../../src/domain/payments/payment-status';

const validTransitions: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  PENDING: ['APPROVED', 'DECLINED', 'FAILED', 'REVIEW_REQUIRED'],
  REVIEW_REQUIRED: ['APPROVED', 'DECLINED', 'FAILED'],
  APPROVED: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  PARTIALLY_REFUNDED: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  DECLINED: [],
  FAILED: [],
  REFUNDED: [],
};

describe('PaymentStatus transitions', () => {
  it.each(PAYMENT_STATUSES.flatMap((from) =>
    PAYMENT_STATUSES.map((to) => [from, to] as const),
  ))('checks the complete transition matrix: %s -> %s', (from, to) => {
    const expected = validTransitions[from].includes(to);
    expect(canTransitionPaymentStatus(from, to, { source: 'gateway', reference: 'op-1' })).toBe(expected);
  });

  it('requires evidence for every valid transition', () => {
    expect(canTransitionPaymentStatus('PENDING', 'APPROVED')).toBe(false);
    expect(canTransitionPaymentStatus('REVIEW_REQUIRED', 'FAILED')).toBe(false);
    expect(canTransitionPaymentStatus('PENDING', 'APPROVED', { source: 'gateway', reference: ' ' })).toBe(false);
  });

  it('keeps REVIEW_REQUIRED non-terminal while rejecting unauthorized exits', () => {
    expect(canTransitionPaymentStatus('REVIEW_REQUIRED', 'APPROVED', { source: 'gateway', reference: 'op-1' })).toBe(true);
    expect(() => assertPaymentStatusTransition('REVIEW_REQUIRED', 'APPROVED')).toThrow(DomainError);
    expect(() =>
      assertPaymentStatusTransition('REVIEW_REQUIRED', 'APPROVED', {
        source: 'gateway',
        reference: 'op-1',
      }),
    ).not.toThrow();
  });

  it('rejects terminal and otherwise invalid transitions with STATE_CONFLICT', () => {
    try {
      assertPaymentStatusTransition('DECLINED', 'APPROVED', { source: 'gateway', reference: 'op-1' });
      fail('Expected illegal transition to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('STATE_CONFLICT');
    }
  });
});
