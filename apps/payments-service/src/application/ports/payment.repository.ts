import type { Payment } from '../../domain/payments/payment.entity';

export interface PaymentPersistenceMetadata {
  readonly gatewayReference?: string | null;
  readonly evidenceReference?: string;
  readonly nextReconcileAt?: Date | null;
  readonly reconcileAttempts?: number;
}

export interface PaymentRepository {
  findById(id: string): Promise<Payment | null>;
  findActiveByBookingId(bookingId: string): Promise<Payment | null>;
  save(payment: Payment, metadata?: PaymentPersistenceMetadata): Promise<void>;
}
