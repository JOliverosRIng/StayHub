import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { http } from './http';
import { ApiError } from './identity';
import type { Booking, BookingStatus, Page } from '../types/catalog';

/**
 * Booking history clients (RQ-08). The session bearer is attached by `api/http.ts`.
 *
 * External dependency (G1): the Gateway exposes neither endpoint yet, so both are validated against
 * the MSW contract mock.
 * - OWNER history = real contract `GET /bookings/history` (`getOwnerBookingHistory`): the owner's
 *   received bookings, OWNER only (a guest gets 403), filters by `from`/`to`/`status`/`guestId`.
 * - GUEST history = PROVISIONAL `GET /bookings`: the booking_service contract has NO guest history
 *   list (the guest only has per-id lookups), so this is a provisional endpoint mocked by MSW until a
 *   guest-facing listing exists. Align when the contract is published.
 */

export interface OwnerBookingHistoryFilters {
  status?: BookingStatus;
  guestId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface GuestBookingHistoryFilters {
  status?: BookingStatus;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

/** Serializes filters to a query string; empty values are not sent and the default page is omitted. */
function toParams(filters: OwnerBookingHistoryFilters | GuestBookingHistoryFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    if (key === 'page' && value === 1) continue;
    params.set(key, String(value));
  }
  return params;
}

// ---------------------------------------------------------------------------
// Owner history (contract)
// ---------------------------------------------------------------------------

export const ownerBookingHistoryKeys = {
  all: ['bookings', 'owner-history'] as const,
  list: (filters: OwnerBookingHistoryFilters) => [...ownerBookingHistoryKeys.all, filters] as const,
};

export async function getOwnerBookingHistory(filters: OwnerBookingHistoryFilters = {}, signal?: AbortSignal): Promise<Page<Booking>> {
  const { data } = await http.get<Page<Booking>>('/bookings/history', { params: toParams(filters), signal });
  return data;
}

export function useOwnerBookingHistory(filters: OwnerBookingHistoryFilters = {}) {
  return useQuery({
    queryKey: ownerBookingHistoryKeys.list(filters),
    queryFn: ({ signal }) => getOwnerBookingHistory(filters, signal),
    placeholderData: keepPreviousData,
  });
}

// ---------------------------------------------------------------------------
// Guest history (provisional)
// ---------------------------------------------------------------------------

export const guestBookingHistoryKeys = {
  all: ['bookings', 'guest-history'] as const,
  list: (filters: GuestBookingHistoryFilters) => [...guestBookingHistoryKeys.all, filters] as const,
};

export async function getGuestBookingHistory(filters: GuestBookingHistoryFilters = {}, signal?: AbortSignal): Promise<Page<Booking>> {
  const { data } = await http.get<Page<Booking>>('/bookings', { params: toParams(filters), signal });
  return data;
}

export function useGuestBookingHistory(filters: GuestBookingHistoryFilters = {}) {
  return useQuery({
    queryKey: guestBookingHistoryKeys.list(filters),
    queryFn: ({ signal }) => getGuestBookingHistory(filters, signal),
    placeholderData: keepPreviousData,
  });
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

/** Safe, filter-aware copy for a history request failure. */
export function bookingHistoryErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 400) return 'Revisa los filtros del historial.';
  if (error instanceof ApiError && error.status === 401) return 'Tu sesión venció. Inicia sesión nuevamente.';
  if (error instanceof ApiError && error.status === 403) return 'Esta sección es solo para propietarios.';
  return 'No pudimos cargar el historial de reservas. Intenta nuevamente.';
}

/** Human-readable, text-first booking status (never color alone). */
export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING_PAYMENT: 'Pago pendiente',
  CONFIRMED: 'Confirmada',
  CHECKED_IN: 'En curso',
  COMPLETED: 'Completada',
  PAYMENT_FAILED: 'Pago fallido',
  EXPIRED: 'Expirada',
  CANCELLED_BY_GUEST: 'Cancelada por el huésped',
  CANCELLED_BY_OWNER: 'Cancelada por el anfitrión',
};
