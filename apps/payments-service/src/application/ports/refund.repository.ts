import type { Refund } from '../../domain/refunds/refund.entity';
import type { Payment } from '../../domain/payments/payment.entity';

export interface LockedRefundPayment {
  readonly payment: Payment;
  readonly gatewayReference: string | null;
}

export interface RefundPersistenceMetadata {
  readonly gatewayReference?: string | null;
  readonly evidenceReference?: string;
  readonly actor?: string;
  readonly reasonCode?: string;
  readonly nextReconcileAt?: Date | null;
  readonly reconcileAttempts?: number;
}

export interface RefundRepository {
  findById(id: string): Promise<Refund | null>;
  findInFlightByPaymentId(paymentId: string): Promise<Refund | null>;
  lockPaymentForRefund(paymentId: string): Promise<LockedRefundPayment | null>;
  save(refund: Refund, metadata?: RefundPersistenceMetadata): Promise<void>;
}
