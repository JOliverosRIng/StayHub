export const BOOKING_STATUSES = ['PENDING_PAYMENT','CONFIRMED','CHECKED_IN','COMPLETED','PAYMENT_FAILED','EXPIRED','CANCELLED_BY_GUEST','CANCELLED_BY_OWNER'] as const;
export type BookingStatus = typeof BOOKING_STATUSES[number];
export const BLOCKING_STATUSES: readonly BookingStatus[] = ['PENDING_PAYMENT','CONFIRMED','CHECKED_IN'];
const transitions: Readonly<Record<BookingStatus, readonly BookingStatus[]>> = {
  PENDING_PAYMENT: ['CONFIRMED','PAYMENT_FAILED','EXPIRED','CANCELLED_BY_GUEST','CANCELLED_BY_OWNER'],
  CONFIRMED: ['CHECKED_IN','CANCELLED_BY_GUEST','CANCELLED_BY_OWNER'], CHECKED_IN: ['COMPLETED'],
  COMPLETED: [], PAYMENT_FAILED: [], EXPIRED: [], CANCELLED_BY_GUEST: [], CANCELLED_BY_OWNER: [],
};
export function canTransition(from: BookingStatus, to: BookingStatus): boolean { return transitions[from].includes(to); }
