import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../test/msw/server';
import { mockDb, mockToken } from '../../test/msw/handlers';
import { BOOKING_IDS, GUEST_ID, OTHER_GUEST_ID, OWNER_ID, PROPERTY_IDS } from '../../test/msw/fixtures';
import { createQueryWrapper, createTestQueryClient } from '../../test/utils';
import { ApiError } from './identity';
import { session } from './session';
import { bookingErrorMessage, bookingKeys, createBooking, getBooking, useBooking, useCreateBooking } from './bookings';

/**
 * FE-027 (RQ-07) — booking client, test-first.
 *
 * Aligned to `specs/003-reservas-pagos-resenas/booking_service/contracts/openapi-bookings-service.yaml`:
 * `POST /bookings` (requires an `Idempotency-Key`, returns the booking in PENDING_PAYMENT) and
 * `GET /bookings/:id`. Runs entirely against the MSW contract mock — the Gateway does not expose
 * `/bookings` yet (External dependency: G1); wire to the real environment when it does.
 *
 * Expected RED until FE-029 implements `./bookings` (createBooking, getBooking, useCreateBooking,
 * useBooking, bookingKeys, bookingErrorMessage).
 *
 * NOTE (contract vs. backlog): the backlog mentions a 403 when a booking belongs to another guest,
 * but `GET /bookings/:id` only defines 400/401/404; a non-owned booking is hidden as 404 (below).
 */

const room = () => mockDb.property(PROPERTY_IDS.casaAzul)!.rooms[0]!;
const validInput = () => ({
  propertyId: PROPERTY_IDS.casaAzul, roomId: room().id, checkIn: '2027-01-05', checkOut: '2027-01-08', guests: 2,
});
// Unique key per call (pattern ^[A-Za-z0-9._:-]{16,128}$); a fixed key is used only for the replay test.
const key = () => `idem-${crypto.randomUUID()}`;

let token: string | undefined;
beforeEach(() => {
  token = mockToken('GUEST', GUEST_ID);
  vi.spyOn(session, 'accessToken').mockImplementation(() => token);
});
afterEach(() => vi.restoreAllMocks());

describe('POST /bookings', () => {
  it('creates a booking in PENDING_PAYMENT with the quoted nights and total', async () => {
    const created = await createBooking(validInput(), key());
    expect(created).toMatchObject({
      propertyId: PROPERTY_IDS.casaAzul, roomId: room().id, guests: 2, nights: 3,
      status: 'PENDING_PAYMENT', propertyName: 'Casa Azul Frente al Mar', roomName: 'Casa completa',
    });
    expect(created.nightlyPrice).toEqual({ amount: '145.00', currency: 'USD' });
    expect(created.total).toEqual({ amount: '435.00', currency: 'USD' });
    expect(created.guestId).toBe(GUEST_ID);
    expect(created).not.toHaveProperty('ownerId'); // the guest view never exposes ownerId
    expect(mockDb.booking(created.id)).toBeDefined();
  });

  it('sends exactly the contract fields with the session bearer and the Idempotency-Key', async () => {
    let body: unknown; let authorization: string | null = null; let idempotency: string | null = null;
    const k = key();
    server.events.on('request:start', async ({ request }) => {
      if (request.method === 'POST') {
        authorization = request.headers.get('Authorization');
        idempotency = request.headers.get('Idempotency-Key');
        body = await request.clone().json();
      }
    });
    await createBooking(validInput(), k);
    server.events.removeAllListeners();
    expect(Object.keys(body as object).sort()).toEqual(['checkIn', 'checkOut', 'guests', 'propertyId', 'roomId']);
    expect(authorization).toBe(`Bearer ${token}`);
    expect(idempotency).toBe(k);
  });

  it('requires an authenticated session (401)', async () => {
    token = undefined;
    const error = await createBooking(validInput(), key()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401 });
    expect(bookingErrorMessage(error)).toBe('Tu sesión venció. Inicia sesión nuevamente.');
  });

  it('rejects invalid dates by field (400)', async () => {
    const error = await createBooking({ ...validInput(), checkIn: '2027-01-10', checkOut: '2027-01-08' }, key()).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 400, problem: { code: 'VALIDATION_ERROR' } });
    expect((error as ApiError).problem?.errors?.map((e) => e.field)).toContain('checkOut');
    expect(bookingErrorMessage(error)).toBe('Revisa las fechas y el número de huéspedes.');
  });

  it('rejects more guests than the room capacity (400)', async () => {
    const error = await createBooking({ ...validInput(), guests: 8 }, key()).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 400, problem: { code: 'VALIDATION_ERROR' } });
    expect((error as ApiError).problem?.errors?.map((e) => e.field)).toContain('guests');
  });

  it('rejects dates that overlap an existing booking (409 BOOKING_CONFLICT)', async () => {
    // Casa Azul room 1 is already booked [2026-12-10, 2026-12-14); this request overlaps.
    const error = await createBooking({ ...validInput(), checkIn: '2026-12-12', checkOut: '2026-12-16' }, key()).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 409, problem: { code: 'BOOKING_CONFLICT' } });
    expect(bookingErrorMessage(error)).toBe('Esas fechas ya no están disponibles. Elige otras.');
  });

  it('returns 404 for a missing property or room', async () => {
    const noProperty = await createBooking({ ...validInput(), propertyId: '00000000-0000-4000-8000-000000000000' }, key()).catch((e: unknown) => e);
    expect(noProperty).toMatchObject({ status: 404, problem: { code: 'NOT_FOUND' } });
    expect(bookingErrorMessage(noProperty)).toBe('No encontramos la propiedad o la habitación seleccionada.');
    const noRoom = await createBooking({ ...validInput(), roomId: '00000000-0000-4000-8000-000000000001' }, key()).catch((e: unknown) => e);
    expect(noRoom).toMatchObject({ status: 404 });
  });

  it('is idempotent: replaying the same key does not create a duplicate', async () => {
    const stableKey = 'idem-booking-replay-000001';
    const before = mockDb.bookings().length;
    const first = await createBooking(validInput(), stableKey);
    const again = await createBooking(validInput(), stableKey);
    expect(again.id).toBe(first.id);
    expect(mockDb.bookings()).toHaveLength(before + 1);
  });
});

describe('GET /bookings/:id', () => {
  it('returns the booking with its status and total for its guest', async () => {
    const booking = await getBooking(BOOKING_IDS.casaAzulConfirmed);
    expect(booking).toMatchObject({ id: BOOKING_IDS.casaAzulConfirmed, status: 'CONFIRMED', guests: 2, guestId: GUEST_ID });
    expect(booking.total).toEqual({ amount: '580.00', currency: 'USD' });
    expect(booking).not.toHaveProperty('ownerId');
  });

  it('exposes ownerId to the property owner', async () => {
    token = mockToken('OWNER', OWNER_ID);
    const booking = await getBooking(BOOKING_IDS.casaAzulConfirmed);
    expect(booking.ownerId).toBe(OWNER_ID);
  });

  it('hides a booking that belongs to another guest (404 per contract, not 403)', async () => {
    token = mockToken('GUEST', OTHER_GUEST_ID);
    await expect(getBooking(BOOKING_IDS.casaAzulConfirmed)).rejects.toMatchObject({ status: 404 });
  });

  it('maps a non-existent booking to 404', async () => {
    const error = await getBooking('00000000-0000-4000-8000-0000000000aa').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, problem: { code: 'NOT_FOUND' } });
  });
});

describe('React Query hooks', () => {
  it('useCreateBooking creates the booking and caches its detail', async () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => useCreateBooking(), { wrapper: createQueryWrapper(client) });

    result.current.mutate({ input: validInput(), idempotencyKey: key() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const created = result.current.data!;
    expect(created.status).toBe('PENDING_PAYMENT');
    expect(client.getQueryData(bookingKeys.detail(created.id))).toMatchObject({ id: created.id, status: 'PENDING_PAYMENT' });
  });

  it('useBooking fetches an existing booking', async () => {
    const { result } = renderHook(() => useBooking(BOOKING_IDS.casaAzulConfirmed), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.data?.status).toBe('CONFIRMED'));
  });
});
