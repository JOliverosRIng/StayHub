import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useBooking } from '../../api/bookings';
import { ApiError } from '../../api/identity';
import { formatMoney } from '../../api/properties';
import { chargeMessage, simulateCharge, toMinorUnits, type ChargeResult } from '../../api/payments';
import { paths } from '../../app/navigation';
import { Button } from '../../components/Button';
import { Header } from '../../components/Header';
import { useBookings } from '../../context/BookingContext';

/**
 * RQ-07 payment step (FE-031) at `/booking/:bookingId/pay`, behind a GUEST guard (see routes.tsx).
 * The booking (`GET /bookings/:id`) is the source of truth for the summary and whether it is already
 * paid; the gateway is simulated on the client (see api/payments.ts), because payments-service is
 * internal and not exposed on the Gateway. On approval the booking is confirmed server-side by
 * bookings-service in production; here we show success and link to the guest's bookings.
 */

type Phase = 'idle' | 'processing' | 'paid' | 'failed';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />
      <main className="flex-1 max-w-xl mx-auto px-6 py-10 w-full">{children}</main>
    </div>
  );
}

export function Payment() {
  const { bookingId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const query = useBooking(bookingId);
  const { clearDraft } = useBookings();

  const [token, setToken] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<ChargeResult>();
  const submitting = useRef(false);
  const statusRef = useRef<HTMLDivElement>(null);

  const unauthenticated = query.isError && query.error instanceof ApiError && query.error.status === 401;
  useEffect(() => {
    if (unauthenticated) navigate(paths.login, { replace: true, state: { from: `${location.pathname}${location.search}` } });
  }, [unauthenticated, navigate, location]);

  if (query.isPending || unauthenticated) {
    return <Shell><p role="status" className="text-sm text-gray-500 py-12 text-center">Cargando tu reserva…</p></Shell>;
  }

  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <Shell>
        <div role="alert" className="flex flex-col items-start gap-3 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
          <p>{notFound ? 'No encontramos tu reserva.' : 'No pudimos cargar tu reserva. Intenta nuevamente.'}</p>
          {!notFound && <button type="button" onClick={() => { void query.refetch(); }} className="font-semibold underline">Reintentar</button>}
        </div>
      </Shell>
    );
  }

  const booking = query.data;
  const alreadyPaid = booking.status === 'CONFIRMED' || booking.paymentStatus === 'CAPTURED';

  const pay = () => {
    if (submitting.current) return;
    submitting.current = true;
    setPhase('processing');
    void simulateCharge({ amountMinor: toMinorUnits(booking.total.amount), currency: booking.total.currency, token })
      .then((charge) => {
        setResult(charge);
        setPhase(charge.status === 'APPROVED' ? 'paid' : 'failed');
        if (charge.status === 'APPROVED') clearDraft();
      })
      .finally(() => {
        submitting.current = false;
        requestAnimationFrame(() => statusRef.current?.focus());
      });
  };

  const retry = () => { setResult(undefined); setPhase('idle'); };

  const summary = (
    <dl className="flex flex-col gap-2 border border-gray-200 rounded-2xl p-4 mb-6 text-sm">
      <div className="flex justify-between"><dt className="text-gray-600">Alojamiento</dt><dd className="font-medium text-gray-900">{booking.propertyName}</dd></div>
      <div className="flex justify-between"><dt className="text-gray-600">Habitación</dt><dd className="font-medium text-gray-900">{booking.roomName}</dd></div>
      <div className="flex justify-between"><dt className="text-gray-600">Fechas</dt><dd className="font-medium text-gray-900">{booking.checkIn} → {booking.checkOut}</dd></div>
      <div className="flex justify-between"><dt className="text-gray-600">Huéspedes</dt><dd className="font-medium text-gray-900">{booking.guests}</dd></div>
      <div className="flex justify-between border-t border-gray-100 pt-2 text-base font-bold text-gray-900"><dt>Total</dt><dd>{formatMoney(booking.total.amount, booking.total.currency)}</dd></div>
    </dl>
  );

  return (
    <Shell>
      <h1 className="text-3xl font-bold text-gray-900 mb-1">Pagar tu reserva</h1>
      <p className="text-sm text-gray-500 mb-6">Pago simulado: no se realizará ningún cargo real.</p>
      {summary}

      {alreadyPaid ? (
        <div ref={statusRef} tabIndex={-1} role="status" className="bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-3 rounded-xl focus:outline-none">
          <p className="font-semibold mb-3">Tu reserva ya está confirmada.</p>
          <Link to={paths.bookings} className="inline-flex items-center h-10 px-4 rounded-xl bg-primary text-white text-sm font-semibold hover:opacity-90">Ver mis reservas</Link>
        </div>
      ) : phase === 'paid' ? (
        <div ref={statusRef} tabIndex={-1} role="status" className="bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-3 rounded-xl focus:outline-none">
          <p className="font-semibold mb-3">{chargeMessage(result!)}</p>
          <Link to={paths.bookings} className="inline-flex items-center h-10 px-4 rounded-xl bg-primary text-white text-sm font-semibold hover:opacity-90">Ver mis reservas</Link>
        </div>
      ) : phase === 'failed' ? (
        <div className="flex flex-col gap-4">
          <div ref={statusRef} tabIndex={-1} role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl focus:outline-none">
            {chargeMessage(result!)}
          </div>
          <Button variant="primary" size="lg" onClick={retry}>Reintentar</Button>
        </div>
      ) : phase === 'processing' ? (
        <p ref={statusRef} tabIndex={-1} role="status" className="text-sm text-gray-700 py-6 text-center focus:outline-none">Procesando tu pago…</p>
      ) : (
        <form noValidate onSubmit={(e) => { e.preventDefault(); pay(); }} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="payment-token" className="text-xs font-semibold text-gray-700">Token de pago</label>
            <input
              id="payment-token" type="text" value={token} autoComplete="off" placeholder="tok_..."
              onChange={(e) => setToken(e.target.value)}
              className="h-10 px-3 border border-gray-300 rounded-xl text-sm"
            />
            <p className="text-xs text-gray-400">Token opaco simulado; nunca ingreses datos reales de tarjeta.</p>
          </div>
          <Button type="submit" variant="primary" size="lg">Pagar</Button>
        </form>
      )}
    </Shell>
  );
}
