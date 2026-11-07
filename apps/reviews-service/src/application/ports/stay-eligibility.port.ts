export interface ReviewEligibility { bookingId: string; guestId: string; propertyId: string; eligible: boolean; }
export const STAY_ELIGIBILITY_PORT = Symbol('STAY_ELIGIBILITY_PORT');
export interface StayEligibilityPort { getEligibility(bookingId: string, guestId: string, traceId: string): Promise<ReviewEligibility>; }
