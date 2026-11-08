import type { Refund } from '../../domain/refunds/refund.entity';

export interface RefundRepository {
  findById(id: string): Promise<Refund | null>;
  findInFlightByPaymentId(paymentId: string): Promise<Refund | null>;
  save(refund: Refund): Promise<void>;
}
