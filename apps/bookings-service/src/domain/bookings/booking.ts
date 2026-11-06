import { randomUUID } from 'node:crypto';
import { DomainError, invalid } from '@bookings/domain/shared/domain-error';
import type { Money } from '@bookings/domain/money/money';
import type { StayPeriod } from './stay-period';
import { canTransition, type BookingStatus } from './booking-status';
export interface BookingSnapshot { propertyId: string; roomId: string; ownerId: string; propertyName: string; roomName: string; capacity: number; propertyVersion: number; roomUpdatedAt: Date; }
export interface NewBooking { id?: string; guestId: string; guests: number; period: StayPeriod; nightlyPrice: Money; snapshot: BookingSnapshot; holdExpiresAt: Date; }
export class Booking {
  public status: BookingStatus = 'PENDING_PAYMENT'; public paymentOrderId: string | null = null;
  public readonly id: string; public readonly total: Money;
  public constructor(public readonly data: NewBooking) {
    this.id = data.id ?? randomUUID();
    if (!Number.isSafeInteger(data.guests) || data.guests < 1 || data.guests > data.snapshot.capacity) invalid('guests');
    if (data.holdExpiresAt.getTime() <= Date.now()) invalid('holdExpiresAt');
    this.total = data.nightlyPrice.multiply(data.period.nights);
  }
  public transition(to: BookingStatus): void { if (!canTransition(this.status, to)) throw new DomainError('STATE_CONFLICT'); this.status = to; }
}
