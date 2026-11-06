import { CheckInBookingUseCase } from '@bookings/application/stay-lifecycle/check-in-booking.use-case';
import { CheckOutBookingUseCase } from '@bookings/application/stay-lifecycle/check-out-booking.use-case';
import { GetReviewEligibilityUseCase } from '@bookings/application/stay-lifecycle/get-review-eligibility.use-case';
import { BOOKING_ID, GUEST_ID, OTHER_ID, OWNER_ID, storedBooking } from '../fixtures/booking.fixture';

describe('stay lifecycle use cases', () => {
  let today = '2030-01-01';
  const clock = { now: () => new Date(`${today}T00:00:00.000Z`), today: () => today };
  const uow = { checkIn: jest.fn(), checkOut: jest.fn() };
  const make = (booking = storedBooking()) => ({
    uow,
    checkIn: new CheckInBookingUseCase({ findById: jest.fn().mockResolvedValue(booking) }, uow, clock),
    checkOut: new CheckOutBookingUseCase({ findById: jest.fn().mockResolvedValue(booking) }, uow, clock),
  });

  beforeEach(() => { today = '2030-01-01'; jest.clearAllMocks(); uow.checkIn.mockResolvedValue(storedBooking({ status: 'CHECKED_IN' })); uow.checkOut.mockResolvedValue(storedBooking({ status: 'COMPLETED' })); });

  it('hides check-in and check-out for a booking owned by another owner', async () => {
    await expect(make().checkIn.execute({ bookingId: BOOKING_ID, ownerId: OTHER_ID })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(make().checkOut.execute({ bookingId: BOOKING_ID, ownerId: OTHER_ID })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('requires CONFIRMED for check-in and CHECKED_IN for check-out', async () => {
    await expect(make(storedBooking({ status: 'PENDING_PAYMENT' })).checkIn.execute({ bookingId: BOOKING_ID, ownerId: OWNER_ID })).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
    await expect(make(storedBooking({ status: 'CONFIRMED' })).checkOut.execute({ bookingId: BOOKING_ID, ownerId: OWNER_ID })).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
  });

  it('rejects an incoherent check-in date before check-in or on check-out', async () => {
    today = '2029-12-31';
    await expect(make().checkIn.execute({ bookingId: BOOKING_ID, ownerId: OWNER_ID })).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
    today = '2030-01-03';
    await expect(make().checkIn.execute({ bookingId: BOOKING_ID, ownerId: OWNER_ID })).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
  });

  it('rejects check-out before the check-in date', async () => {
    today = '2029-12-31';
    await expect(make(storedBooking({ status: 'CHECKED_IN' })).checkOut.execute({ bookingId: BOOKING_ID, ownerId: OWNER_ID })).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
  });

  it('delegates a valid check-in with version and timestamp', async () => {
    await make().checkIn.execute({ bookingId: BOOKING_ID, ownerId: OWNER_ID });
    expect(uow.checkIn).toHaveBeenCalledWith({ bookingId: BOOKING_ID, expectedVersion: 1, actorId: OWNER_ID, now: new Date('2030-01-01T00:00:00.000Z') });
  });

  it('delegates a valid check-out with version and timestamp', async () => {
    const useCase = make(storedBooking({ status: 'CHECKED_IN', checkedInAt: '2030-01-01T10:00:00.000Z' }));
    await useCase.checkOut.execute({ bookingId: BOOKING_ID, ownerId: OWNER_ID });
    expect(uow.checkOut).toHaveBeenCalledWith({ bookingId: BOOKING_ID, expectedVersion: 1, actorId: OWNER_ID, now: new Date('2030-01-01T00:00:00.000Z') });
  });

  it('is idempotent for an already checked-in or completed booking', async () => {
    await expect(make(storedBooking({ status: 'CHECKED_IN' })).checkIn.execute({ bookingId: BOOKING_ID, ownerId: OWNER_ID })).resolves.toMatchObject({ status: 'CHECKED_IN' });
    await expect(make(storedBooking({ status: 'COMPLETED' })).checkOut.execute({ bookingId: BOOKING_ID, ownerId: OWNER_ID })).resolves.toMatchObject({ status: 'COMPLETED' });
    expect(uow.checkIn).not.toHaveBeenCalled();
    expect(uow.checkOut).not.toHaveBeenCalled();
  });
});

describe('review eligibility', () => {
  const make = (booking = storedBooking({ status: 'COMPLETED' })) => new GetReviewEligibilityUseCase({ findById: jest.fn().mockResolvedValue(booking) });

  it('grants eligibility only to the matching guest of a completed booking', async () => {
    await expect(make().execute({ bookingId: BOOKING_ID, guestId: GUEST_ID })).resolves.toEqual({ bookingId: BOOKING_ID, guestId: GUEST_ID, propertyId: '00000000-0000-4000-8000-000000000005', eligible: true });
  });

  it('hides eligibility for a foreign guest, a missing booking or an unfinished stay', async () => {
    await expect(make().execute({ bookingId: BOOKING_ID, guestId: OTHER_ID })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(make(storedBooking({ status: 'CHECKED_IN' })).execute({ bookingId: BOOKING_ID, guestId: GUEST_ID })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(new GetReviewEligibilityUseCase({ findById: jest.fn().mockResolvedValue(null) }).execute({ bookingId: BOOKING_ID, guestId: GUEST_ID })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
