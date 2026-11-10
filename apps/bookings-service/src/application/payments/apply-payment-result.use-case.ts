import type { PaymentResultEvent, PaymentResultUnitOfWork } from '@bookings/application/ports/payment-saga.port';

export class ApplyPaymentResultUseCase {
  public constructor(private readonly unitOfWork: PaymentResultUnitOfWork) {}
  public execute(event: PaymentResultEvent, hash: string): Promise<'APPLIED'|'DUPLICATE'> { return this.unitOfWork.apply(event, hash); }
}
