import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useOwnerBookingHistory } from '../../api/bookings-history';
import { paths } from '../../app/navigation';
import type { Booking } from '../../types/catalog';
import { BookingRow, HistoryShell, isCancelable } from '../MyBookings';

/**
 * RQ-08 (FE-033) — owner "bookings received", driven by the real contract `GET /bookings/history`
 * (OWNER only). Server-side filters: status + check-in date range (and guest, via the client, if
 * needed). Property is a client-side filter over the fetched page. Mounted under the OWNER guard.
 */
export function BookingsReceived() {
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [property, setProperty] = useState('');

  const query = useOwnerBookingHistory({
    status: (status || undefined) as Booking['status'] | undefined,
    from: from || undefined,
    to: to || undefined,
  });

  const propertyNames = [...new Set((query.data?.items ?? []).map((b) => b.propertyName))];

  return (
    <HistoryShell
      eyebrow="Panel de anfitrión"
      title="Reservas recibidas"
      status={status} from={from} to={to}
      onStatus={setStatus} onFrom={setFrom} onTo={setTo}
      query={query}
      loadingText="Cargando las reservas…"
      listLabel="Reservas recibidas"
      extraFilters={(
        <div className="flex flex-col gap-1">
          <label htmlFor="history-property" className="text-xs font-semibold text-gray-700">Propiedad</label>
          <select id="history-property" value={property} onChange={(e) => setProperty(e.target.value)} className="h-10 px-3 border border-gray-300 rounded-xl text-sm">
            <option value="">Todas</option>
            {propertyNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
      )}
      listFilter={(items) => (property ? items.filter((b) => b.propertyName === property) : items)}
      empty={(
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Todavía no tienes reservas recibidas</h2>
          <p className="text-gray-500 text-sm">Cuando un huésped reserve una de tus propiedades, aparecerá aquí.</p>
        </div>
      )}
      renderItem={(booking) => (
        <BookingRow key={booking.id} booking={booking}>
          <p className="text-xs text-gray-500 mt-1">Huésped: {booking.guestId}</p>
          {isCancelable(booking) && (
            <Link to={paths.cancelBooking(booking.id)} className="inline-block mt-2 text-sm font-semibold text-red-600 hover:underline">
              Cancelar reserva
            </Link>
          )}
        </BookingRow>
      )}
    />
  );
}
