import type { Payment } from '../../domain/payments/payment.entity';

export interface PaymentRepository {
  findById(id: string): Promise<Payment | null>;
  findActiveByBookingId(bookingId: string): Promise<Payment | null>;
  save(payment: Payment): Promise<void>;
}
