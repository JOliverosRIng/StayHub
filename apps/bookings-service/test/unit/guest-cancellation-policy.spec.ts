import { CancelGuestBookingUseCase } from '@bookings/application/cancel-booking/cancel-guest-booking.use-case';
import { VersionedCancellationPolicyAdapter } from '@bookings/infrastructure/config/versioned-cancellation-policy.adapter';
import { BOOKING_ID, GUEST_ID, OTHER_ID, storedBooking } from '../fixtures/booking.fixture';

const config = { cancellationPolicyVersion: 'v1', cancellationPolicy: { version: 'v1', freeCancellationBeforeHours: 48, refundPercent: 50 } } as never;

describe('versioned guest cancellation policy', () => {
  it('is eligible before the approved deadline and refunds by policy', () => {
    const policy = new VersionedCancellationPolicyAdapter(config);
    expect(policy.evaluate({ actor: 'GUEST', status: 'CONFIRMED', checkIn: '2030-01-10', now: new Date('2030-01-01T00:00:00Z') })).toEqual({ eligible: true, refundMode: 'POLICY', policyVersion: 'v1' });
  });

  it('returns a full refund mode when the approved policy grants 100 percent', () => {
    const policy = new VersionedCancellationPolicyAdapter({ cancellationPolicyVersion: 'v1', cancellationPolicy: { version: 'v1', freeCancellationBeforeHours: 24, refundPercent: 100 } } as never);
    expect(policy.evaluate({ actor: 'GUEST', status: 'PENDING_PAYMENT', checkIn: '2030-01-10', now: new Date('2030-01-01T00:00:00Z') }).refundMode).toBe('FULL');
  });

  it('returns no refund when the approved policy grants zero percent', () => {
    const policy = new VersionedCancellationPolicyAdapter({ cancellationPolicyVersion: 'v1', cancellationPolicy: { version: 'v1', freeCancellationBeforeHours: 24, refundPercent: 0 } } as never);
    expect(policy.evaluate({ actor: 'GUEST', status: 'CONFIRMED', checkIn: '2030-01-10', now: new Date('2030-01-01T00:00:00Z') }).refundMode).toBe('NONE');
  });

  it('is ineligible after the approved deadline', () => {
    const policy = new VersionedCancellationPolicyAdapter(config);
    expect(policy.evaluate({ actor: 'GUEST', status: 'CONFIRMED', checkIn: '2030-01-10', now: new Date('2030-01-09T12:00:00Z') })).toEqual({ eligible: false, refundMode: 'NONE', policyVersion: 'v1' });
  });

  it('is ineligible for a non cancellable status', () => {
    const policy = new VersionedCancellationPolicyAdapter(config);
    expect(policy.evaluate({ actor: 'GUEST', status: 'COMPLETED', checkIn: '2030-01-10', now: new Date('2030-01-01T00:00:00Z') }).eligible).toBe(false);
  });

  it('fails closed without an approved policy or with a mismatched version', () => {
    expect(() => new VersionedCancellationPolicyAdapter({ cancellationPolicyVersion: 'v1', cancellationPolicy: null } as never).evaluate({ actor: 'GUEST', status: 'CONFIRMED', checkIn: '2030-01-10', now: new Date() })).toThrow('DEPENDENCY_UNAVAILABLE');
    expect(() => new VersionedCancellationPolicyAdapter({ cancellationPolicyVersion: 'v1', cancellationPolicy: { version: 'v2', freeCancellationBeforeHours: 24, refundPercent: 50 } } as never).evaluate({ actor: 'GUEST', status: 'CONFIRMED', checkIn: '2030-01-10', now: new Date() })).toThrow('DEPENDENCY_UNAVAILABLE');
  });
});

describe('CancelGuestBookingUseCase', () => {
  const policy = { evaluate: jest.fn() };
  const uow = { cancel: jest.fn() };
  const clock = { now: () => new Date('2030-01-01T00:00:00Z'), today: () => '2030-01-01' };
  const make = (booking = storedBooking()) => {
    policy.evaluate.mockReturnValue({ eligible: true, refundMode: 'POLICY', policyVersion: 'v1' });
    uow.cancel.mockResolvedValue({ ...booking, status: 'CANCELLED_BY_GUEST' });
    return new CancelGuestBookingUseCase({ findById: jest.fn().mockResolvedValue(booking) }, policy, uow, clock);
  };

  beforeEach(() => { jest.clearAllMocks(); });

  it('hides a booking owned by another guest', async () => {
    await expect(make().execute({ bookingId: BOOKING_ID, actorId: OTHER_ID })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(make().execute({ bookingId: BOOKING_ID, actorId: GUEST_ID })).resolves.toMatchObject({ status: 'CANCELLED_BY_GUEST' });
  });

  it('is idempotent for an already cancelled booking', async () => {
    const cancelled = storedBooking({ status: 'CANCELLED_BY_GUEST', cancelledBy: 'GUEST' });
    await expect(make(cancelled).execute({ bookingId: BOOKING_ID, actorId: GUEST_ID })).resolves.toMatchObject({ status: 'CANCELLED_BY_GUEST' });
    expect(uow.cancel).not.toHaveBeenCalled();
  });

  it('rejects a non cancellable state', async () => {
    await expect(make(storedBooking({ status: 'COMPLETED' })).execute({ bookingId: BOOKING_ID, actorId: GUEST_ID })).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
  });

  it('maps an ineligible policy to a stable conflict without mutating', async () => {
    const useCase = make();
    policy.evaluate.mockReturnValue({ eligible: false, refundMode: 'NONE', policyVersion: 'v1' });
    await expect(useCase.execute({ bookingId: BOOKING_ID, actorId: GUEST_ID })).rejects.toMatchObject({ code: 'CANCELLATION_NOT_ALLOWED' });
    expect(uow.cancel).not.toHaveBeenCalled();
  });

  it('delegates an eligible cancellation with the policy decision and expected version', async () => {
    await make().execute({ bookingId: BOOKING_ID, actorId: GUEST_ID });
    expect(uow.cancel).toHaveBeenCalledWith({ bookingId: BOOKING_ID, expectedVersion: 1, actorId: GUEST_ID, now: new Date('2030-01-01T00:00:00Z'), decision: { eligible: true, refundMode: 'POLICY', policyVersion: 'v1' } });
  });
});
