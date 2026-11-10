import type { PaymentGatewayPort, TransactionResult } from '../ports/payment-gateway.port';
import type { ReconciliationClaim, ReconciliationRepository } from '../ports/reconciliation.repository';
import type { ReconciliationObserverPort } from '../ports/reconciliation-observer.port';
import type { UnitOfWork } from '../ports/unit-of-work';
import type { RefundUnitOfWorkRepositories } from '../../infrastructure/persistence/prisma/unit-of-work';
import {
  approvedPaymentEvent,
  declinedPaymentEvent,
  refundedPaymentEvent,
  refundFailedPaymentEvent,
  refundReviewRequiredPaymentEvent,
  reviewRequiredPaymentEvent,
} from '../events/payment-events';

export interface ReconcilePendingConfig {
  readonly batchSize: number;
  readonly maxAttempts: number;
  readonly intervalMs: number;
  readonly leaseMs: number;
}

export class ReconcilePending {
  constructor(
    private readonly repository: ReconciliationRepository,
    private readonly unitOfWork: UnitOfWork<RefundUnitOfWorkRepositories>,
    private readonly gateway: PaymentGatewayPort,
    private readonly config: ReconcilePendingConfig,
    private readonly now: () => Date = () => new Date(),
    private readonly observer?: ReconciliationObserverPort,
  ) {}

  async execute(): Promise<number> {
    const claims = await this.repository.claimDueBatch(this.config.batchSize, this.config.leaseMs);
    for (const claim of claims) {
      const startedAt = Date.now();
      let result: TransactionResult;
      try {
        result = await this.gateway.getTransaction(claim.gatewayReference);
      } catch {
        result = { kind: 'unknown' };
      }
      const outcome = claim.kind === 'payment'
        ? await this.reconcilePayment(claim, result)
        : await this.reconcileRefund(claim, result);
      this.observer?.resolved({ kind: claim.kind, outcome, attempts: claim.attempts, durationMs: Date.now() - startedAt });
    }
    return claims.length;
  }

  private async reconcilePayment(claim: Extract<ReconciliationClaim, { kind: 'payment' }>, result: TransactionResult): Promise<string> {
    return this.unitOfWork.transaction(async ({ payments, outbox }) => {
      const payment = await payments.findById(claim.id);
      if (!payment || payment.status !== 'PENDING') return 'ALREADY_RESOLVED';
      const occurredAt = this.now();
      if (result.kind === 'approved') {
        payment.approve({ source: 'gateway-reconciliation', reference: result.reference });
        await payments.save(payment, { gatewayReference: result.reference, evidenceReference: result.reference, nextReconcileAt: null, reconcileAttempts: claim.attempts });
        await outbox.append(approvedPaymentEvent(payment, occurredAt));
        return 'APPROVED';
      }
      if (result.kind === 'declined') {
        payment.decline(result.failureCode, { source: 'gateway-reconciliation', reference: result.reference });
        await payments.save(payment, { gatewayReference: result.reference, evidenceReference: result.reference, nextReconcileAt: null, reconcileAttempts: claim.attempts });
        await outbox.append(declinedPaymentEvent(payment, occurredAt, result.failureCode));
        return 'DECLINED';
      }
      if (claim.attempts >= this.config.maxAttempts) {
        payment.markReviewRequired({ source: 'gateway-reconciliation', reference: claim.gatewayReference });
        await payments.save(payment, { evidenceReference: claim.gatewayReference, nextReconcileAt: null, reconcileAttempts: claim.attempts });
        await outbox.append(reviewRequiredPaymentEvent(payment, occurredAt));
        return 'REVIEW_REQUIRED';
      }
      await payments.save(payment, {
        nextReconcileAt: new Date(occurredAt.getTime() + this.backoffMs(claim.attempts)),
        reconcileAttempts: claim.attempts,
      });
      return 'RETRY_SCHEDULED';
    });
  }

  private async reconcileRefund(claim: Extract<ReconciliationClaim, { kind: 'refund' }>, result: TransactionResult): Promise<string> {
    return this.unitOfWork.transaction(async ({ payments, refunds, outbox }) => {
      const locked = await refunds.lockPaymentForRefund(claim.paymentId);
      if (!locked) return 'ALREADY_RESOLVED';
      const refund = await refunds.findById(claim.id);
      if (!refund || refund.status !== 'PENDING') return 'ALREADY_RESOLVED';
      const occurredAt = this.now();
      if (result.kind === 'refund-completed') {
        refund.complete({ source: 'gateway-reconciliation', reference: result.reference });
        locked.payment.applyRefund(refund.amount, { source: 'gateway-reconciliation', reference: result.reference });
        await payments.save(locked.payment, { evidenceReference: result.reference });
        await refunds.save(refund, {
          gatewayReference: result.reference,
          evidenceReference: result.reference,
          nextReconcileAt: null,
          reconcileAttempts: claim.attempts,
          actor: 'payments-service',
        });
        await outbox.append(refundedPaymentEvent(locked.payment, refund, occurredAt));
        return 'REFUND_COMPLETED';
      }
      if (result.kind === 'refund-failed') {
        refund.fail(result.failureCode, { source: 'gateway-reconciliation', reference: result.reference });
        await refunds.save(refund, {
          gatewayReference: result.reference,
          evidenceReference: result.reference,
          nextReconcileAt: null,
          reconcileAttempts: claim.attempts,
          actor: 'payments-service',
        });
        await outbox.append(refundFailedPaymentEvent(locked.payment, refund, occurredAt));
        return 'REFUND_FAILED';
      }
      if (claim.attempts >= this.config.maxAttempts) {
        refund.markReviewRequired({ source: 'gateway-reconciliation', reference: claim.gatewayReference });
        await refunds.save(refund, {
          evidenceReference: claim.gatewayReference,
          nextReconcileAt: null,
          reconcileAttempts: claim.attempts,
          actor: 'payments-service',
          reasonCode: 'RECONCILIATION_EXHAUSTED',
        });
        await outbox.append(refundReviewRequiredPaymentEvent(locked.payment, refund, occurredAt));
        return 'REVIEW_REQUIRED';
      }
      await refunds.save(refund, {
        nextReconcileAt: new Date(occurredAt.getTime() + this.backoffMs(claim.attempts)),
        reconcileAttempts: claim.attempts,
        actor: 'payments-service',
      });
      return 'RETRY_SCHEDULED';
    });
  }

  private backoffMs(attempts: number): number {
    return Math.min(this.config.intervalMs * 2 ** Math.max(0, attempts - 1), 300_000);
  }
}
