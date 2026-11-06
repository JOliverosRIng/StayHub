import type { StoredBooking } from '@bookings/application/ports/create-booking.unit-of-work';

export const GUEST_ID = '00000000-0000-4000-8000-000000000001';
export const OWNER_ID = '00000000-0000-4000-8000-000000000002';
export const OTHER_ID = '00000000-0000-4000-8000-000000000003';
export const BOOKING_ID = '00000000-0000-4000-8000-000000000004';
export const UNKNOWN_BOOKING_ID = '00000000-0000-4000-8000-000000000099';

export function storedBooking(overrides: Partial<StoredBooking> = {}): StoredBooking {
  return {
    id: BOOKING_ID,
    guestId: GUEST_ID,
    ownerId: OWNER_ID,
    propertyId: '00000000-0000-4000-8000-000000000005',
    roomId: '00000000-0000-4000-8000-000000000006',
    propertyName: 'Snapshot Property',
    roomName: 'Snapshot Room',
    checkIn: '2030-01-01',
    checkOut: '2030-01-03',
    guests: 2,
    nights: 2,
    nightlyPriceAmount: '10.50',
    totalAmount: '21.00',
    currency: 'USD',
    status: 'CONFIRMED',
    paymentStatus: 'CAPTURED',
    paymentOrderId: '00000000-0000-4000-8000-000000000007',
    holdExpiresAt: '2029-12-31T23:59:59.000Z',
    cancellationPolicyVersion: null,
    cancelledBy: null,
    cancellationReason: null,
    cancelledAt: null,
    checkedInAt: null,
    checkedOutAt: null,
    version: 1,
    createdAt: '2029-12-01T10:00:00.000Z',
    updatedAt: '2029-12-02T10:00:00.000Z',
    ...overrides,
  };
}
