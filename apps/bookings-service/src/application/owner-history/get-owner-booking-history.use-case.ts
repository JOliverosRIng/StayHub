import { OWNER_BOOKING_HISTORY_PORT, type BookingPage, type OwnerBookingHistoryPort } from '@bookings/application/ports/owner-booking-history.port';

export interface GetOwnerBookingHistoryQuery {
  ownerId: string;
  from?: string;
  to?: string;
  status?: string;
  guestId?: string;
  page: number;
  pageSize: number;
}

export class GetOwnerBookingHistoryUseCase {
  public static readonly dependencies = [OWNER_BOOKING_HISTORY_PORT] as const;
  public constructor(private readonly history: OwnerBookingHistoryPort) {}
  public execute(query: GetOwnerBookingHistoryQuery): Promise<BookingPage> { return this.history.findPage(query); }
}
