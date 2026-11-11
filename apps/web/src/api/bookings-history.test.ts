import { renderHook, waitFor } from '@testing-library/react';
import { http as mock } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../test/msw/server';
import { mockToken, problem } from '../../test/msw/handlers';
import { BOOKING_IDS, GUEST_ID, OTHER_GUEST_ID, OWNER_ID } from '../../test/msw/fixtures';
import { createQueryWrapper } from '../../test/utils';
import { ApiError } from './identity';
import { session } from './session';
import type { Booking } from '../types/catalog';
import {
  bookingHistoryErrorMessage, getOwnerBookingHistory, ownerBookingHistoryKeys, useOwnerBookingHistory,
} from './bookings-history';

/**
 * FE-032 (RQ-08) — owner booking-history client, test-first.
 *
 * Contract alignment: `GET /bookings/history` (`getOwnerBookingHistory`) is OWNER-ONLY — the owner's
 * received bookings, with filters `from`/`to` (by checkIn), `status`, `guestId`, pagination and order
 * `createdAt DESC, id DESC` (booking_service/spec.md RQ-08, BKG-FR-010). The guest has no history list
 * endpoint in the contract (only per-id lookups), so this covers only the owner view.
 *
 * External dependency (G1): the Gateway does not expose `/bookings/history` yet; validated against MSW.
 * Expected RED until FE-033 implements `./bookings-history`
 * (getOwnerBookingHistory, useOwnerBookingHistory, ownerBookingHistoryKeys, bookingHistoryErrorMessage).
 */

let token: string | undefined;
beforeEach(() => {
  token = mockToken('OWNER', OWNER_ID);
  vi.spyOn(session, 'accessToken').mockImplementation(() => token);
});
afterEach(() => vi.restoreAllMocks());

describe('GET /bookings/history', () => {
  it('returns the owner received bookings newest first with the session bearer', async () => {
    let authorization: string | null = null;
    server.events.on('request:start', ({ request }) => {
      if (request.url.includes('/bookings/history')) authorization = request.headers.get('Authorization');
    });
    const page = await getOwnerBookingHistory({});
    server.events.removeAllListeners();
    expect(authorization).toBe(`Bearer ${token}`);
    expect(page).toMatchObject({ page: 1, pageSize: 20, total: 3, hasNext: false });
    expect(page.items.map((b: Booking) => b.id)).toEqual([BOOKING_IDS.cabanaCancelled, BOOKING_IDS.casaAzulConfirmed, BOOKING_IDS.villaCompleted]);
    expect(page.items[0]).toMatchObject({ ownerId: OWNER_ID }); // the owner sees ownerId
  });

  it('does not send empty filters', async () => {
    let url = '';
    server.events.on('request:start', ({ request }) => { if (request.url.includes('/bookings/history')) url = request.url; });
    await getOwnerBookingHistory({});
    server.events.removeAllListeners();
    expect([...new URL(url).searchParams.keys()]).toEqual([]);
  });

  it('filters by status, sending only that parameter', async () => {
    let url = '';
    server.events.on('request:start', ({ request }) => { if (request.url.includes('/bookings/history')) url = request.url; });
    const page = await getOwnerBookingHistory({ status: 'CONFIRMED' });
    server.events.removeAllListeners();
    const qs = new URL(url).searchParams;
    expect(qs.get('status')).toBe('CONFIRMED');
    expect(qs.has('from')).toBe(false);
    expect(qs.has('guestId')).toBe(false);
    expect(page.items.map((b: Booking) => b.id)).toEqual([BOOKING_IDS.casaAzulConfirmed]);
  });

  it('filters by guest', async () => {
    const page = await getOwnerBookingHistory({ guestId: OTHER_GUEST_ID });
    expect(page.items.map((b: Booking) => b.id)).toEqual([BOOKING_IDS.cabanaCancelled]);
  });

  it('filters by check-in date range', async () => {
    const page = await getOwnerBookingHistory({ from: '2026-12-01', to: '2026-12-31' });
    expect(page.items.map((b: Booking) => b.id)).toEqual([BOOKING_IDS.casaAzulConfirmed]);
  });

  it('paginates, newest first', async () => {
    const first = await getOwnerBookingHistory({ pageSize: 1 });
    expect(first).toMatchObject({ page: 1, pageSize: 1, total: 3, hasNext: true });
    expect(first.items.map((b: Booking) => b.id)).toEqual([BOOKING_IDS.cabanaCancelled]);
    const second = await getOwnerBookingHistory({ page: 2, pageSize: 1 });
    expect(second).toMatchObject({ page: 2, pageSize: 1, total: 3, hasNext: true });
    expect(second.items.map((b: Booking) => b.id)).toEqual([BOOKING_IDS.casaAzulConfirmed]);
  });

  it('maps rows to the booking shape (id, property, dates, guests, total, status)', async () => {
    const page = await getOwnerBookingHistory({ status: 'CONFIRMED' });
    expect(page.items[0]).toMatchObject({
      id: BOOKING_IDS.casaAzulConfirmed, propertyName: 'Casa Azul Frente al Mar',
      checkIn: '2026-12-10', checkOut: '2026-12-14', guests: 2, status: 'CONFIRMED',
    });
    expect(page.items[0].total).toEqual({ amount: '580.00', currency: 'USD' });
  });

  it('returns an empty page for an owner with no bookings', async () => {
    token = mockToken('OWNER', '00000000-0000-4000-8000-0000000000e0');
    const page = await getOwnerBookingHistory({});
    expect(page).toMatchObject({ items: [], total: 0, hasNext: false });
  });

  it('requires an authenticated session (401)', async () => {
    token = undefined;
    const error = await getOwnerBookingHistory({}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401 });
    expect(bookingHistoryErrorMessage(error)).toBe('Tu sesión venció. Inicia sesión nuevamente.');
  });

  it('rejects a non-owner (403)', async () => {
    token = mockToken('GUEST', GUEST_ID);
    const error = await getOwnerBookingHistory({}).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 403 });
    expect(bookingHistoryErrorMessage(error)).toBe('Esta sección es solo para propietarios.');
  });

  it('maps invalid filters (400) to a UI message', async () => {
    server.use(mock.get('*/api/v1/bookings/history', () => problem(400, 'VALIDATION_ERROR', [{ field: 'status', code: 'INVALID_VALUE' }])));
    const error = await getOwnerBookingHistory({ status: 'CONFIRMED' }).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 400, problem: { code: 'VALIDATION_ERROR' } });
    expect(bookingHistoryErrorMessage(error)).toBe('Revisa los filtros del historial.');
  });

  it('maps a server failure (5xx) to a retryable message', async () => {
    server.use(mock.get('*/api/v1/bookings/history', () => problem(503, 'UNAVAILABLE')));
    const error = await getOwnerBookingHistory({}).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 503 });
    expect(bookingHistoryErrorMessage(error)).toBe('No pudimos cargar el historial de reservas. Intenta nuevamente.');
  });
});

describe('React Query hook', () => {
  it('loads the filtered history', async () => {
    const { result } = renderHook(() => useOwnerBookingHistory({ status: 'CONFIRMED' }), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.data?.items.map((b: Booking) => b.id)).toEqual([BOOKING_IDS.casaAzulConfirmed]));
  });

  it('keys the cache by filters so changing a filter is a new query', () => {
    expect(ownerBookingHistoryKeys.list({ status: 'CONFIRMED' }))
      .not.toEqual(ownerBookingHistoryKeys.list({ status: 'COMPLETED' }));
  });
});
