import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useBooking } from '../../api/bookings';
import { cancellationErrorMessage, refundStatusMessage, useCancelBooking } from '../../api/bookings-cancel';
import { BOOKING_STATUS_LABELS } from '../../api/bookings-history';
import { ApiError } from '../../api/identity';
import { formatMoney } from '../../api/properties';
import { paths } from '../../app/navigation';
import { Button } from '../../components/Button';
import { Header } from '../../components/Header';
import { useAuth } from '../../context/AuthContext';
import type { Booking } from '../../types/catalog';

/**
 * RQ-09/RQ-10 cancellation step (FE-035) at `/bookings/:bookingId/cancel`.
 * The booking (`GET /bookings/:id`) drives the summary and whether it is cancelable. The owner must
 * type a justification; the guest only confirms. On success the refund result comes from
 * `booking.paymentStatus` (the backend decides it; the UI never recomputes amounts). The contract
 * defines no deadlines/percentages, so the policy note is generic.
 */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />
      <main className="flex-1 max-w-xl mx-auto px-6 py-10 w-full">{children}</main>
    </div>
  );
}

export function CancelBooking() {
  const { bookingId = '' } = useParams();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const query = useBooking(bookingId);
  const cancelMutation = useCancelBooking();

  const actor: 'guest' | 'owner' = currentUser?.role === 'OWNER' ? 'owner' : 'guest';
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<Booking>();
  const [general, setGeneral] = useState<string>();
  const submitting = useRef(false);
  const statusRef = useRef<HTMLDivElement>(null);

  const loadUnauthenticated = query.isError && query.error instanceof ApiError && query.error.status === 401;
  useEffect(() => {
    if (loadUnauthenticated) navigate(paths.login, { replace: true, state: { from: `${location.pathname}${location.search}` } });
  }, [loadUnauthenticated, navigate, location]);

  if (query.isPending || loadUnauthenticated) {
    return <Shell><p role="status" className="text-sm text-gray-500 py-12 text-center">Cargando tu reserva…</p></Shell>;
  }
  if (query.isError) {
    return (
      <Shell>
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
          {cancellationErrorMessage(query.error)}
        </div>
      </Shell>
    );
  }

  const booking = query.data;
  const cancelable = booking.status === 'PENDING_PAYMENT' || booking.status === 'CONFIRMED';

  const confirm = () => {
    if (submitting.current) return;
    if (actor === 'owner' && !reason.trim()) { setGeneral('Indica el motivo de la cancelación.'); return; }
    submitting.current = true;
    setGeneral(undefined);
    cancelMutation.mutate(
      { bookingId: booking.id, reason: actor === 'owner' ? reason.trim() : undefined },
      {
        onSuccess: (cancelled) => {
          setResult(cancelled);
          requestAnimationFrame(() => statusRef.current?.focus());
        },
        onError: (error) => {
          submitting.current = false;
          if (error instanceof ApiError && error.status === 401) {
            navigate(paths.login, { replace: true, state: { from: `${location.pathname}${location.search}` } });
            return;
          }
          setGeneral(cancellationErrorMessage(error));
          requestAnimationFrame(() => statusRef.current?.focus());
        },
      },
    );
  };

  const summary = (
    <dl className="flex flex-col gap-2 border border-gray-200 rounded-2xl p-4 mb-6 text-sm">
      <div className="flex justify-between"><dt className="text-gray-600">Alojamiento</dt><dd className="font-medium text-gray-900">{booking.propertyName}</dd></div>
      <div className="flex justify-between"><dt className="text-gray-600">Fechas</dt><dd className="font-medium text-gray-900">{booking.checkIn} → {booking.checkOut}</dd></div>
      <div className="flex justify-between text-base font-bold text-gray-900 border-t border-gray-100 pt-2"><dt>Total</dt><dd>{formatMoney(booking.total.amount, booking.total.currency)}</dd></div>
    </dl>
  );

  return (
    <Shell>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Cancelar reserva</h1>
      {summary}

      {result ? (
        <div ref={statusRef} tabIndex={-1} role="status" className="bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-3 rounded-xl focus:outline-none">
          <p className="font-semibold mb-1">Reserva cancelada.</p>
          <p className="mb-1">{BOOKING_STATUS_LABELS[result.status]}</p>
          <p className="mb-3">{refundStatusMessage(result.paymentStatus)}</p>
          <Link to={paths.bookings} className="inline-flex items-center h-10 px-4 rounded-xl bg-primary text-white text-sm font-semibold hover:opacity-90">Ver mis reservas</Link>
        </div>
      ) : !cancelable ? (
        <div role="alert" className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-xl">
          Esta reserva ya no se puede cancelar ({BOOKING_STATUS_LABELS[booking.status]}).
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">
            Se aplicará la política de cancelación vigente; si corresponde, iniciaremos el reembolso.
            {actor === 'owner' && ' El huésped recibirá el reembolso total.'}
          </p>

          {actor === 'owner' && (
            <div className="flex flex-col gap-1">
              <label htmlFor="cancel-reason" className="text-xs font-semibold text-gray-700">Motivo de la cancelación</label>
              <textarea
                id="cancel-reason" rows={3} value={reason} maxLength={500}
                onChange={(e) => { setReason(e.target.value); setGeneral(undefined); }}
                className="px-3 py-2 border border-gray-300 rounded-xl text-sm"
              />
              <p className="text-xs text-gray-400">Obligatorio para cancelar como anfitrión.</p>
            </div>
          )}

          {general && (
            <div ref={statusRef} tabIndex={-1} role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl focus:outline-none">
              {general}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button
              variant="primary" size="lg"
              loading={cancelMutation.isPending}
              disabled={actor === 'owner' && !reason.trim()}
              onClick={confirm}
            >
              Confirmar cancelación
            </Button>
            <Link to={paths.bookings} className="text-sm font-medium text-gray-600 hover:underline">Volver</Link>
          </div>
        </div>
      )}
    </Shell>
  );
}
