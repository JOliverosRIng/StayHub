import { useMutation, useQueryClient } from '@tanstack/react-query';
import { http } from './http';
import { ApiError } from './identity';
import { bookingKeys } from './bookings';
import { guestBookingHistoryKeys, ownerBookingHistoryKeys } from './bookings-history';
import type { Booking, PaymentStatus } from '../types/catalog';

/**
 * Cancellation client (RQ-09/RQ-10) through the Gateway. The session bearer is attached by `api/http.ts`.
 *
 * External dependency (G1): the Gateway does not expose cancellation yet, so this is validated against
 * the MSW contract mock. Aligned to `booking_service` `DELETE /bookings/:id` (`cancelBooking`):
 * `reason` is required for the OWNER; only PENDING_PAYMENT/CONFIRMED are cancelable (else 409). The
 * contract defines NO deadlines/percentages and NO Idempotency-Key on cancel; a second cancel is a 409
 * (not a duplicate refund). The refund is coordinated by payments-service and surfaces on
 * `booking.paymentStatus`.
 */

export interface CancelBookingInput {
  /** Mandatory when the actor is the property owner; ignored for the guest. */
  reason?: string;
}

export async function cancelBooking(bookingId: string, body: CancelBookingInput = {}, signal?: AbortSignal): Promise<Booking> {
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  const { data } = await http.delete<Booking>(`/bookings/${bookingId}`, {
    ...(reason ? { data: { reason } } : {}),
    signal,
  });
  return data;
}

export function useCancelBooking() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId, reason }: { bookingId: string; reason?: string }) => cancelBooking(bookingId, { reason }),
    onSuccess: (booking) => {
      client.setQueryData(bookingKeys.detail(booking.id), booking);
      // Refresh both histories so the lists reflect the new status without a reload.
      void client.invalidateQueries({ queryKey: ownerBookingHistoryKeys.all });
      void client.invalidateQueries({ queryKey: guestBookingHistoryKeys.all });
    },
  });
}

/** Refund state (from `booking.paymentStatus`) as Spanish UI text. */
export function refundStatusMessage(paymentStatus: PaymentStatus): string {
  switch (paymentStatus) {
    case 'REFUND_PENDING': return 'Reembolso en proceso.';
    case 'REFUNDED': return 'Reembolsado.';
    case 'PARTIALLY_REFUNDED': return 'Reembolso parcial.';
    default: return 'Sin reembolso.';
  }
}

export function cancellationErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'No pudimos cancelar la reserva. Intenta nuevamente.';
  switch (error.status) {
    case 400: return 'Indica el motivo de la cancelación.';
    case 401: return 'Tu sesión venció. Inicia sesión nuevamente.';
    case 403: return 'No puedes cancelar esta reserva.';
    case 404: return 'No encontramos la reserva.';
    case 409: return 'Esta reserva ya no se puede cancelar.';
    default: return 'No pudimos cancelar la reserva. Intenta nuevamente.';
  }
}
