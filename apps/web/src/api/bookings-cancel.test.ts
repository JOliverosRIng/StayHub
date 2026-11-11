import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../test/msw/server';
import { mockDb, mockToken, problem } from '../../test/msw/handlers';
import { BOOKING_IDS, GUEST_ID, OWNER_ID } from '../../test/msw/fixtures';
import { createQueryWrapper, createTestQueryClient } from '../../test/utils';
import { http as mock } from 'msw';
import { ApiError } from './identity';
import { session } from './session';
import { bookingKeys } from './bookings';
import { cancelBooking, cancellationErrorMessage, refundStatusMessage, useCancelBooking } from './bookings-cancel';

/**
 * FE-034 (RQ-09/RQ-10) — cancellation client, test-first.
 *
 * Contract alignment (`booking_service`): `DELETE /bookings/:id` (`cancelBooking`). `reason` is
 * required for the OWNER (400 otherwise); only PENDING_PAYMENT/CONFIRMED are cancelable (else 409);
 * refunds are coordinated internally by payments-service and reflected on `booking.paymentStatus`
 * (REFUND_PENDING/…). The contract defines NO deadlines/percentages (spec §65/§137), NO policy-preview
 * endpoint, and NO Idempotency-Key on cancel — a second cancel is a 409, not a duplicate refund.
 *
 * External dependency (G1): the Gateway does not expose cancellation yet; validated against MSW.
 * Expected RED until FE-035 implements `./bookings-cancel`.
 */

let token: string | undefined;
beforeEach(() => {
  // The contract has no date-based tranches, so the clock is frozen only for determinism.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-11-10T12:00:00.000Z'));
  token = mockToken('GUEST', GUEST_ID);
  vi.spyOn(session, 'accessToken').mockImplementation(() => token);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('guest cancellation (RQ-09)', () => {
  it('cancels the guest booking and reports the refund state', async () => {
    const booking = await cancelBooking(BOOKING_IDS.casaAzulConfirmed);
    expect(booking).toMatchObject({ id: BOOKING_IDS.casaAzulConfirmed, status: 'CANCELLED_BY_GUEST' });
    expect(booking.cancellationReason).toBeNull();
    expect(booking.paymentStatus).toBe('REFUND_PENDING'); // captured payment → refund initiated
    expect(refundStatusMessage(booking.paymentStatus)).toBe('Reembolso en proceso.');
  });

  it('sends the bearer and does not duplicate the refund on a second cancel (409)', async () => {
    let authorization: string | null = null;
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'DELETE') authorization = request.headers.get('Authorization');
    });
    await cancelBooking(BOOKING_IDS.casaAzulConfirmed);
    server.events.removeAllListeners();
    expect(authorization).toBe(`Bearer ${token}`);
    const error = await cancelBooking(BOOKING_IDS.casaAzulConfirmed).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 409, problem: { code: 'STATE_CONFLICT' } });
    expect(mockDb.booking(BOOKING_IDS.casaAzulConfirmed)!.paymentStatus).toBe('REFUND_PENDING'); // unchanged
  });

  it('rejects a non-cancelable stay (409) when it is already completed', async () => {
    const error = await cancelBooking(BOOKING_IDS.villaCompleted).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 409, problem: { code: 'STATE_CONFLICT' } });
    expect(cancellationErrorMessage(error)).toBe('Esta reserva ya no se puede cancelar.');
  });
});

describe('owner cancellation (RQ-10)', () => {
  it('requires a non-empty justification (400 by field)', async () => {
    token = mockToken('OWNER', OWNER_ID);
    const error = await cancelBooking(BOOKING_IDS.casaAzulConfirmed).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 400, problem: { code: 'VALIDATION_ERROR' } });
    expect((error as ApiError).problem?.errors?.map((e) => e.field)).toContain('reason');
    expect(cancellationErrorMessage(error)).toBe('Indica el motivo de la cancelación.');
  });

  it('cancels with a justification and leaves the guest with a full refund', async () => {
    token = mockToken('OWNER', OWNER_ID);
    const booking = await cancelBooking(BOOKING_IDS.casaAzulConfirmed, { reason: 'Mantenimiento imprevisto del alojamiento.' });
    expect(booking).toMatchObject({ status: 'CANCELLED_BY_OWNER', cancellationReason: 'Mantenimiento imprevisto del alojamiento.' });
    expect(booking.paymentStatus).toBe('REFUND_PENDING');
  });
});

describe('refund status copy', () => {
  it('maps payment/refund states to Spanish UI text', () => {
    expect(refundStatusMessage('REFUND_PENDING')).toBe('Reembolso en proceso.');
    expect(refundStatusMessage('REFUNDED')).toBe('Reembolsado.');
    expect(refundStatusMessage('PARTIALLY_REFUNDED')).toBe('Reembolso parcial.');
    expect(refundStatusMessage('NOT_STARTED')).toBe('Sin reembolso.');
  });
});

describe('errors', () => {
  it('requires a session (401)', async () => {
    token = undefined;
    const error = await cancelBooking(BOOKING_IDS.casaAzulConfirmed).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401 });
    expect(cancellationErrorMessage(error)).toBe('Tu sesión venció. Inicia sesión nuevamente.');
  });

  it('forbids cancelling a booking that is not yours (403)', async () => {
    const error = await cancelBooking(BOOKING_IDS.cabanaCancelled).catch((e: unknown) => e); // belongs to another guest
    expect(error).toMatchObject({ status: 403 });
    expect(cancellationErrorMessage(error)).toBe('No puedes cancelar esta reserva.');
  });

  it('maps a missing booking to 404', async () => {
    const error = await cancelBooking('00000000-0000-4000-8000-0000000000cc').catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 404, problem: { code: 'NOT_FOUND' } });
    expect(cancellationErrorMessage(error)).toBe('No encontramos la reserva.');
  });

  it('maps a server failure (5xx) to a retryable message', async () => {
    server.use(mock.delete('*/api/v1/bookings/:bookingId', () => problem(503, 'UNAVAILABLE')));
    const error = await cancelBooking(BOOKING_IDS.casaAzulConfirmed).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 503 });
    expect(cancellationErrorMessage(error)).toBe('No pudimos cancelar la reserva. Intenta nuevamente.');
  });
});

describe('useCancelBooking', () => {
  it('cancels through React Query and refreshes the cached booking detail', async () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => useCancelBooking(), { wrapper: createQueryWrapper(client) });

    result.current.mutate({ bookingId: BOOKING_IDS.casaAzulConfirmed });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ status: 'CANCELLED_BY_GUEST' });
    expect(client.getQueryData(bookingKeys.detail(BOOKING_IDS.casaAzulConfirmed))).toMatchObject({ status: 'CANCELLED_BY_GUEST' });
  });
});
