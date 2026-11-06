import type { RefundResultEvent, RefundResultUnitOfWork } from '@bookings/application/ports/payment-saga.port';

export class ApplyRefundResultUseCase {
  public constructor(private readonly unitOfWork: RefundResultUnitOfWork) {}
  public execute(event: RefundResultEvent, hash: string): Promise<'APPLIED' | 'DUPLICATE'> { return this.unitOfWork.apply(event, hash); }
}
