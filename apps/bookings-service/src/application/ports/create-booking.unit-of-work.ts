import type { Booking } from '@bookings/domain/bookings/booking';
export interface PersistCreateBooking { booking:Booking; idempotencyKey:string; requestHash:string; traceId?:string; }
export interface StoredBooking { id:string;guestId:string;ownerId:string;propertyId:string;roomId:string;propertyName:string;roomName:string;checkIn:string;checkOut:string;guests:number;nights:number;nightlyPriceAmount:string;totalAmount:string;currency:string;status:string;paymentStatus:string;paymentOrderId:string|null;holdExpiresAt:string|null;cancellationPolicyVersion:string|null;cancelledBy:'GUEST'|'OWNER'|'SYSTEM'|null;cancellationReason:string|null;cancelledAt:string|null;checkedInAt:string|null;checkedOutAt:string|null;version:number;createdAt:string;updatedAt:string; }
export interface CreateBookingUnitOfWork { create(input:PersistCreateBooking):Promise<StoredBooking>; }
export const CREATE_BOOKING_UOW=Symbol('CREATE_BOOKING_UOW');
