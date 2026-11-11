import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from './http';
import { ApiError } from './identity';
import type { Booking, CreateBookingInput } from '../types/catalog';

/**
 * Bookings client (RQ-07) through the Gateway. The session bearer is attached by `api/http.ts`.
 *
 * External dependency (G1): the Gateway does not expose `/bookings` yet, so this is validated against
 * the MSW contract mock. Aligned to
 * `specs/003-reservas-pagos-resenas/booking_service/contracts/openapi-bookings-service.yaml`:
 * `POST /bookings` requires an `Idempotency-Key` and returns the booking in `PENDING_PAYMENT`;
 * `GET /bookings/:id` returns a booking the caller made or received.
 */

export const bookingKeys = {
  all: ['bookings'] as const,
  detail: (id: string) => [...bookingKeys.all, 'detail', id] as const,
};

/**
 * A contract-valid `Idempotency-Key` (`^[A-Za-z0-9._:-]{16,128}$`). FE-030 generates one per
 * confirmation attempt and reuses it on retries, so a retried confirmation never duplicates the booking.
 */
export const newIdempotencyKey = (): string => crypto.randomUUID();

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/** `POST /bookings`. Sends only the contract fields; the server quotes nights, price and total. */
export async function createBooking(input: CreateBookingInput, idempotencyKey: string): Promise<Booking> {
  const { data } = await http.post<Booking>('/bookings', input, { headers: { 'Idempotency-Key': idempotencyKey } });
  return data;
}

export function useCreateBooking() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: CreateBookingInput; idempotencyKey: string }) => createBooking(input, idempotencyKey),
    onSuccess: (booking) => {
      client.setQueryData(bookingKeys.detail(booking.id), booking);
      // Refresh any booking list (e.g. history, RQ-08) so the new booking shows up.
      void client.invalidateQueries({ queryKey: bookingKeys.all });
    },
  });
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getBooking(id: string, signal?: AbortSignal): Promise<Booking> {
  const { data } = await http.get<Booking>(`/bookings/${id}`, { signal });
  return data;
}

export function useBooking(id: string | undefined) {
  return useQuery({
    queryKey: bookingKeys.detail(id ?? ''),
    queryFn: ({ signal }) => getBooking(id ?? '', signal),
    enabled: id !== undefined,
  });
}

// ---------------------------------------------------------------------------
// Error copy (safe, keyed by contract `code` first and HTTP status second)
// ---------------------------------------------------------------------------

export function bookingErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'No pudimos completar la reserva. Intenta nuevamente.';
  switch (error.problem?.code) {
    case 'BOOKING_CONFLICT': return 'Esas fechas ya no están disponibles. Elige otras.';
    case 'IDEMPOTENCY_CONFLICT': return 'Ya hay una reserva en curso con esos datos. Revisa tus reservas.';
    default: break;
  }
  switch (error.status) {
    case 400: return 'Revisa las fechas y el número de huéspedes.';
    case 401: return 'Tu sesión venció. Inicia sesión nuevamente.';
    case 403: return 'No tienes permiso para ver esta reserva.';
    case 404: return 'No encontramos la propiedad o la habitación seleccionada.';
    case 409: return 'Esas fechas ya no están disponibles. Elige otras.';
    default: return 'No pudimos completar la reserva. Intenta nuevamente.';
  }
}
