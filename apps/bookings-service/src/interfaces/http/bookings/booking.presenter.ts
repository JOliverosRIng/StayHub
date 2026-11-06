import type { StoredBooking } from '@bookings/application/ports/create-booking.unit-of-work';
export function presentBooking(booking: StoredBooking): Omit<StoredBooking, 'ownerId'> { const safe: Partial<StoredBooking> = { ...booking }; delete safe.ownerId; return safe as Omit<StoredBooking, 'ownerId'>; }
