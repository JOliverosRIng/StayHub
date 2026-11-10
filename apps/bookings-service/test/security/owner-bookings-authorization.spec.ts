import { CancelOwnerBookingUseCase } from '@bookings/application/cancel-booking/cancel-owner-booking.use-case';
import { GetOwnerBookingHistoryUseCase } from '@bookings/application/owner-history/get-owner-booking-history.use-case';
import { BOOKING_ID, GUEST_ID, OTHER_ID, OWNER_ID, storedBooking } from '../fixtures/booking.fixture';
import { BookingsController } from '@bookings/interfaces/http/bookings/bookings.controller';

const settings = { paymentHoldMinutes: 15, cancellationPolicyVersion: 'v1' };
const clock = { now: () => new Date('2035-01-01T00:00:00Z'), today: () => '2035-01-01' };

describe('owner booking authorization', () => {
  const make = (booking = storedBooking()) => {
    const uow = { cancel: jest.fn().mockResolvedValue({ ...booking, status: 'CANCELLED_BY_OWNER' }) };
    return { uow, useCase: new CancelOwnerBookingUseCase({ findById: jest.fn().mockResolvedValue(booking) }, uow, clock, settings) };
  };

  it('hides a booking received by another owner', async () => {
    await expect(make().useCase.execute({ bookingId: BOOKING_ID, ownerId: OTHER_ID, reason: 'Maintenance' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('requires a non blank reason of at most 500 characters', async () => {
    await expect(make().useCase.execute({ bookingId: BOOKING_ID, ownerId: OWNER_ID, reason: '   ' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(make().useCase.execute({ bookingId: BOOKING_ID, ownerId: OWNER_ID, reason: 'a'.repeat(501) })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects a non cancellable state', async () => {
    await expect(make(storedBooking({ status: 'COMPLETED' })).useCase.execute({ bookingId: BOOKING_ID, ownerId: OWNER_ID, reason: 'Maintenance' })).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
  });

  it('is idempotent for an owner cancellation', async () => {
    const cancelled = storedBooking({ status: 'CANCELLED_BY_OWNER', cancelledBy: 'OWNER', cancellationReason: 'Maintenance' });
    const { uow, useCase } = make(cancelled);
    await expect(useCase.execute({ bookingId: BOOKING_ID, ownerId: OWNER_ID, reason: 'Maintenance' })).resolves.toMatchObject({ status: 'CANCELLED_BY_OWNER' });
    expect(uow.cancel).not.toHaveBeenCalled();
  });

  it('delegates with the trimmed reason, audited policy version, full refund and expected version', async () => {
    const { uow, useCase } = make();
    await useCase.execute({ bookingId: BOOKING_ID, ownerId: OWNER_ID, reason: '  Maintenance  ' });
    expect(uow.cancel).toHaveBeenCalledWith({ bookingId: BOOKING_ID, expectedVersion: 1, actorId: OWNER_ID, reason: 'Maintenance', now: new Date('2035-01-01T00:00:00Z'), policyVersion: 'v1' });
  });

  it('scopes history to the authenticated owner without any accommodation lookup', async () => {
    const history = { findPage: jest.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, hasNext: false }) };
    await new GetOwnerBookingHistoryUseCase(history).execute({ ownerId: OWNER_ID, guestId: GUEST_ID, status: 'CONFIRMED', page: 1, pageSize: 20 });
    expect(history.findPage).toHaveBeenCalledWith({ ownerId: OWNER_ID, guestId: GUEST_ID, status: 'CONFIRMED', page: 1, pageSize: 20 });
  });

  it('denies history and cancellation to roles without the capability', async () => {
    const controller = new BookingsController({ execute: jest.fn() } as never, { execute: jest.fn() } as never, { execute: jest.fn() } as never, { execute: jest.fn() } as never, { execute: jest.fn() } as never);
    const admin = { principal: { sub: OWNER_ID, role: 'ADMIN', scopes: [], claims: {} } };
    const guest = { principal: { sub: GUEST_ID, role: 'GUEST', scopes: [], claims: {} } };
    await expect(controller.history({ page: 1, pageSize: 20 } as never, admin as never)).rejects.toMatchObject({ status: 403 });
    await expect(controller.history({ page: 1, pageSize: 20 } as never, guest as never)).rejects.toMatchObject({ status: 403 });
    await expect(controller.remove(BOOKING_ID, { reason: 'x' }, admin as never)).rejects.toMatchObject({ status: 403 });
  });
});
