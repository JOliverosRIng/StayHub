import { GetBookingUseCase } from '@bookings/application/get-booking/get-booking.use-case';
import { presentBooking } from '@bookings/interfaces/http/bookings/booking.presenter';
import { BOOKING_ID, GUEST_ID, OTHER_ID, OWNER_ID, UNKNOWN_BOOKING_ID, storedBooking } from '../fixtures/booking.fixture';

describe('GET /bookings/{bookingId} authorization', () => {
  const booking = storedBooking();
  const repository = { findById: jest.fn(async (id: string) => (id === BOOKING_ID ? booking : null)) };
  const useCase = new GetBookingUseCase(repository);

  it('returns the booking to its guest without disclosing owner or financial references', async () => {
    const result = await useCase.execute({ bookingId: BOOKING_ID, actorId: GUEST_ID, actorRole: 'GUEST' });
    expect(result.viewer).toEqual({ role: 'GUEST', sub: GUEST_ID });
    const view = presentBooking(result.booking, result.viewer);
    expect(view.id).toBe(BOOKING_ID);
    expect(view).not.toHaveProperty('ownerId');
    expect(view).not.toHaveProperty('paymentOrderId');
    expect(view).not.toHaveProperty('nightlyPriceAmount');
    expect(view).toMatchObject({ nightlyPrice: { amount: '10.50', currency: 'USD' }, total: { amount: '21.00', currency: 'USD' } });
  });

  it('returns the booking to its owner and exposes the matching ownerId only then', async () => {
    const result = await useCase.execute({ bookingId: BOOKING_ID, actorId: OWNER_ID, actorRole: 'OWNER' });
    expect(result.viewer).toEqual({ role: 'OWNER', sub: OWNER_ID });
    const view = presentBooking(result.booking, result.viewer);
    expect(view.ownerId).toBe(OWNER_ID);
    expect(view).not.toHaveProperty('paymentOrderId');
  });

  it.each([
    { name: 'another guest', actorId: OTHER_ID, actorRole: 'GUEST' },
    { name: 'another owner', actorId: OTHER_ID, actorRole: 'OWNER' },
    { name: 'an admin', actorId: OWNER_ID, actorRole: 'ADMIN' },
    { name: 'a service token without role', actorId: GUEST_ID },
  ])('hides the resource from $name', async ({ actorId, actorRole }) => {
    await expect(useCase.execute({ bookingId: BOOKING_ID, actorId, ...(actorRole ? { actorRole } : {}) })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('does not disclose whether a missing booking exists', async () => {
    await expect(useCase.execute({ bookingId: UNKNOWN_BOOKING_ID, actorId: GUEST_ID, actorRole: 'GUEST' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
