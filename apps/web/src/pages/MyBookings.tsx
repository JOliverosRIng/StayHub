import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BOOKING_STATUS_LABELS, bookingHistoryErrorMessage, useGuestBookingHistory } from '../api/bookings-history';
import { isReviewable } from '../api/reviews';
import { formatMoney } from '../api/properties';
import { paths } from '../app/navigation';
import { Button } from '../components/Button';
import { Header } from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { BOOKING_STATUSES, type Booking } from '../types/catalog';

interface MyBookingsProps {
  onNavigate: (page: string, id?: string) => void;
}

/** A booking can be cancelled only while it is pending payment or confirmed. */
export const isCancelable = (booking: Booking) => booking.status === 'PENDING_PAYMENT' || booking.status === 'CONFIRMED';

const STATUS_STYLES: Record<string, string> = {
  CONFIRMED: 'bg-green-50 text-green-700 border-green-200',
  COMPLETED: 'bg-gray-100 text-gray-700 border-gray-200',
  PENDING_PAYMENT: 'bg-amber-50 text-amber-700 border-amber-200',
  CHECKED_IN: 'bg-blue-50 text-blue-700 border-blue-200',
};
const statusStyle = (s: string) => STATUS_STYLES[s] ?? 'bg-red-50 text-red-700 border-red-200';

/** One booking as a row; the status is shown with text (never color alone). */
export function BookingRow({ booking, children }: { booking: Booking; children?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gray-200 p-5">
      <div className="min-w-0">
        <div className="flex items-center gap-3 mb-1">
          <h3 className="text-lg font-bold text-gray-900 truncate">{booking.propertyName}</h3>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${statusStyle(booking.status)}`}>
            {BOOKING_STATUS_LABELS[booking.status]}
          </span>
        </div>
        <p className="text-sm text-gray-500">{booking.roomName}</p>
        <p className="text-sm text-gray-700 mt-1">
          {booking.checkIn} → {booking.checkOut} · {booking.guests} huésped{booking.guests === 1 ? '' : 'es'} · {booking.nights} noche{booking.nights === 1 ? '' : 's'}
        </p>
        {children}
      </div>
      <p className="text-base font-bold text-gray-900">{formatMoney(booking.total.amount, booking.total.currency)}</p>
    </li>
  );
}

export function MyBookings({ onNavigate }: MyBookingsProps) {
  const { currentUser } = useAuth();
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const query = useGuestBookingHistory({
    status: (status || undefined) as Booking['status'] | undefined,
    from: from || undefined,
    to: to || undefined,
  });

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <Header onNavigate={onNavigate} />
        <div className="flex-1 flex flex-col items-center justify-center py-24 text-center px-6">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Inicia sesión para ver tus reservas</h2>
          <p className="text-gray-500 text-sm mb-6">Necesitas una cuenta para acceder a esta sección.</p>
          <Button variant="primary" size="lg" onClick={() => onNavigate('login')}>Iniciar sesión</Button>
        </div>
      </div>
    );
  }

  return (
    <HistoryShell
      onNavigate={onNavigate}
      eyebrow="Tu cuenta"
      title="Mis reservas"
      status={status} from={from} to={to}
      onStatus={setStatus} onFrom={setFrom} onTo={setTo}
      query={query}
      loadingText="Cargando tus reservas…"
      empty={(
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Todavía no tienes reservas</h2>
          <p className="text-gray-500 text-sm mb-6">Explora alojamientos y haz tu primera reserva.</p>
          <Link to={paths.search} className="h-11 inline-flex items-center px-5 rounded-xl bg-primary text-white text-sm font-semibold hover:opacity-90">Buscar alojamientos</Link>
        </div>
      )}
      renderItem={(booking) => (
        <BookingRow key={booking.id} booking={booking}>
          {isCancelable(booking) && (
            <Link to={paths.cancelBooking(booking.id)} className="inline-block mt-2 mr-4 text-sm font-semibold text-red-600 hover:underline">
              Cancelar reserva
            </Link>
          )}
          {isReviewable(booking) && (
            <Link to={paths.reviewBooking(booking.id)} className="inline-block mt-2 text-sm font-semibold text-primary hover:underline">
              Calificar alojamiento
            </Link>
          )}
        </BookingRow>
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Shared history layout (filters + states) used by both guest and owner views.
// ---------------------------------------------------------------------------

interface HistoryShellProps {
  onNavigate?: (page: string, id?: string) => void;
  eyebrow: string;
  title: string;
  status: string; from: string; to: string;
  onStatus: (v: string) => void; onFrom: (v: string) => void; onTo: (v: string) => void;
  query: { isPending: boolean; isError: boolean; error: unknown; data?: { items: Booking[] }; refetch: () => void };
  loadingText: string;
  empty: React.ReactNode;
  renderItem: (booking: Booking) => React.ReactNode;
  extraFilters?: React.ReactNode;
  listFilter?: (items: Booking[]) => Booking[];
  listLabel?: string;
}

export function HistoryShell(props: HistoryShellProps) {
  const { query } = props;
  const items = query.data ? (props.listFilter ? props.listFilter(query.data.items) : query.data.items) : [];

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header onNavigate={props.onNavigate} />
      <main className="flex-1 max-w-screen-lg mx-auto px-6 py-10 w-full">
        <p className="text-sm text-primary font-semibold mb-1">{props.eyebrow}</p>
        <h1 className="text-3xl font-bold text-gray-900 mb-6">{props.title}</h1>

        <div className="flex flex-wrap items-end gap-4 mb-6">
          <div className="flex flex-col gap-1">
            <label htmlFor="history-status" className="text-xs font-semibold text-gray-700">Estado</label>
            <select id="history-status" value={props.status} onChange={(e) => props.onStatus(e.target.value)} className="h-10 px-3 border border-gray-300 rounded-xl text-sm">
              <option value="">Todas</option>
              {BOOKING_STATUSES.map((s) => <option key={s} value={s}>{BOOKING_STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="history-from" className="text-xs font-semibold text-gray-700">Desde</label>
            <input id="history-from" type="date" value={props.from} onChange={(e) => props.onFrom(e.target.value)} className="h-10 px-2 border border-gray-300 rounded-xl text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="history-to" className="text-xs font-semibold text-gray-700">Hasta</label>
            <input id="history-to" type="date" value={props.to} onChange={(e) => props.onTo(e.target.value)} className="h-10 px-2 border border-gray-300 rounded-xl text-sm" />
          </div>
          {props.extraFilters}
        </div>

        {query.isError ? (
          <div role="alert" className="flex flex-col items-start gap-3 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
            <p>{bookingHistoryErrorMessage(query.error)}</p>
            <button type="button" onClick={() => query.refetch()} className="font-semibold underline">Reintentar</button>
          </div>
        ) : query.isPending ? (
          <p role="status" className="text-sm text-gray-500 py-12 text-center">{props.loadingText}</p>
        ) : items.length === 0 ? (
          props.empty
        ) : (
          <ul aria-label={props.listLabel ?? 'Reservas'} className="flex flex-col gap-4">
            {items.map((booking) => props.renderItem(booking))}
          </ul>
        )}
      </main>
    </div>
  );
}
