import { useEffect, useMemo, useState } from 'react';
import { formatLocation, formatMoney, photoUrl, sortedPhotos } from '../../api/properties';
import { useAuth } from '../../context/AuthContext';
import { useBookings } from '../../context/BookingContext';
import type { PendingBookingData } from '../../types';
import type { Property, Room } from '../../types/catalog';
import { Button } from '../Button';

/**
 * Availability and booking card. Prices come from the property's rooms; bookings are still
 * stored locally by `BookingContext` until the bookings service is integrated (RQ-07, Sprint 3).
 */

interface BookingPanelProps {
  property: Property;
  pendingBooking?: PendingBookingData | null;
  onBookingRequired: (data: PendingBookingData) => void;
  onBookingConfirmed: () => void;
  onViewBookings: () => void;
}

const SERVICE_FEE_RATE = 0.1;
const today = () => new Date().toISOString().split('T')[0]!;
const diffDays = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fmt(date: string) {
  if (!date) return '';
  const [y, m, d] = date.split('-');
  return `${parseInt(d!, 10)} ${months[parseInt(m!, 10) - 1]} ${y}`;
}

const bookable = (room: Room) => !!room.basePrice;

export function BookingPanel({ property, pendingBooking, onBookingRequired, onBookingConfirmed, onViewBookings }: BookingPanelProps) {
  const { currentUser } = useAuth();
  const { createBooking, getBlockedRanges, isRangeAvailable } = useBookings();
  const rooms = property.rooms.filter(bookable);
  const [roomId, setRoomId] = useState(() => rooms[0]?.id ?? '');
  const room = rooms.find((r) => r.id === roomId) ?? rooms[0];
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guests, setGuests] = useState(1);
  const [errors, setErrors] = useState<string[]>([]);
  const [step, setStep] = useState<'form' | 'confirming' | 'done'>('form');

  // A booking started before login comes back through the router: restore it and ask to confirm.
  useEffect(() => {
    if (pendingBooking && property.rooms.some((r) => r.id === pendingBooking.roomId)) {
      setRoomId(pendingBooking.roomId);
      setCheckIn(pendingBooking.checkIn);
      setCheckOut(pendingBooking.checkOut);
      setGuests(pendingBooking.guests);
      setStep('confirming');
    }
  }, [pendingBooking, property.rooms]);

  const blocked = useMemo(() => (room ? getBlockedRanges(room.id) : []).map((r) => ({
    start: r.start.toISOString().split('T')[0]!,
    end: new Date(r.end.getTime() - 86_400_000).toISOString().split('T')[0]!,
  })), [room, getBlockedRanges]);

  if (!room) {
    return (
      <div className="border border-gray-200 rounded-3xl p-6 text-sm text-gray-600">
        Este alojamiento todavía no tiene habitaciones con precio disponibles para reservar.
      </div>
    );
  }

  const currency = room.basePrice!.currency;
  const price = Number(room.basePrice!.amount);
  const money = (value: number) => formatMoney(value, currency);
  const nights = checkIn && checkOut ? Math.max(0, diffDays(checkIn, checkOut)) : 0;
  const accommodationFee = Math.round(nights * price * 100) / 100;
  const serviceFee = Math.round(accommodationFee * SERVICE_FEE_RATE * 100) / 100;
  const total = accommodationFee + serviceFee;

  const pending = (): PendingBookingData => ({
    roomId: room.id, checkIn, checkOut, guests, nights, pricePerNight: price,
    accommodationFee, cleaningFee: 0, serviceFee, totalPrice: total,
  });

  const validate = (): string[] => {
    const found: string[] = [];
    if (!checkIn) found.push('Selecciona la fecha de entrada');
    else if (checkIn < today()) found.push('La fecha de entrada no puede ser en el pasado');
    if (!checkOut) found.push('Selecciona la fecha de salida');
    else if (checkOut <= checkIn) found.push('La fecha de salida debe ser posterior a la de entrada');
    if (checkIn && checkOut && checkOut > checkIn && !isRangeAvailable(room.id, checkIn, checkOut)) {
      found.push('Las fechas seleccionadas se solapan con una reserva existente');
    }
    if (guests > room.capacity) found.push(`Esta habitación admite hasta ${room.capacity} huéspedes`);
    return found;
  };

  const book = () => {
    const found = validate();
    setErrors(found);
    if (found.length) return;
    if (!currentUser) { onBookingRequired(pending()); return; }
    setStep('confirming');
  };

  const confirm = () => {
    if (!currentUser) return;
    const photo = sortedPhotos(property)[0];
    createBooking({
      userId: currentUser.id, roomId: room.id, roomTitle: `${property.name} · ${room.name}`,
      roomImage: photo ? photoUrl(property.id, photo) : '', roomLocation: formatLocation(property.location),
      checkIn, checkOut, guests, nights, pricePerNight: price, accommodationFee, cleaningFee: 0, serviceFee,
      totalPrice: total, status: 'confirmed',
    });
    onBookingConfirmed();
    setStep('done');
  };

  const breakdown = (
    <dl className="flex flex-col gap-2 border-t border-gray-100 pt-4">
      <div className="flex justify-between text-sm text-gray-700"><dt>{money(price)} × {nights} noche{nights === 1 ? '' : 's'}</dt><dd>{money(accommodationFee)}</dd></div>
      <div className="flex justify-between text-sm text-gray-700"><dt>Tarifa de servicio (10%)</dt><dd>{money(serviceFee)}</dd></div>
      <div className="flex justify-between text-sm font-bold text-gray-900 border-t border-gray-200 pt-3 mt-1"><dt>Total</dt><dd>{money(total)}</dd></div>
    </dl>
  );

  if (step === 'done') {
    return (
      <div className="border border-green-200 bg-green-50 rounded-3xl p-8 text-center" role="status">
        <h2 className="text-xl font-bold text-gray-900 mb-2">¡Reserva confirmada!</h2>
        <p className="text-sm text-gray-600 mb-6">Tu reserva en <strong>{property.name}</strong> ha sido guardada.</p>
        <Button variant="primary" size="lg" fullWidth onClick={onViewBookings}>Ver mis reservas</Button>
        <button onClick={() => { setStep('form'); setCheckIn(''); setCheckOut(''); }} className="mt-3 text-sm text-gray-500 hover:underline block w-full text-center">
          Hacer otra reserva
        </button>
      </div>
    );
  }

  if (step === 'confirming') {
    return (
      <div className="border border-gray-200 rounded-3xl shadow-xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => setStep('form')} aria-label="Volver a editar la reserva" className="text-gray-500 hover:text-gray-800">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h2 className="text-lg font-bold text-gray-900">Confirma tu reserva</h2>
        </div>
        <dl className="flex flex-col gap-2 mb-5 text-sm">
          <div className="flex justify-between"><dt className="text-gray-600">Habitación</dt><dd className="font-medium text-gray-900">{room.name}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-600">Entrada</dt><dd className="font-medium text-gray-900">{fmt(checkIn)}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-600">Salida</dt><dd className="font-medium text-gray-900">{fmt(checkOut)}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-600">Huéspedes</dt><dd className="font-medium text-gray-900">{guests} persona{guests > 1 ? 's' : ''}</dd></div>
        </dl>
        <div className="mb-5">{breakdown}</div>
        <Button variant="primary" size="lg" fullWidth onClick={confirm}>Confirmar reserva</Button>
        <p className="text-xs text-center text-gray-400 mt-3">No se realizará ningún cargo real</p>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-3xl shadow-xl p-6">
      <p className="mb-4">
        <span className="text-2xl font-bold text-gray-900">{money(price)}</span>
        <span className="text-gray-500 text-sm"> / noche</span>
      </p>

      <div className="flex flex-col gap-3 mb-3">
        {rooms.length > 1 && (
          <div className="flex flex-col gap-1">
            <label htmlFor="booking-room" className="text-xs font-semibold text-gray-700">HABITACIÓN</label>
            <select id="booking-room" value={room.id} onChange={(e) => { setRoomId(e.target.value); setGuests(1); setErrors([]); }} className="h-10 px-3 border border-gray-300 rounded-xl text-sm">
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name} · {formatMoney(r.basePrice!.amount, r.basePrice!.currency)}</option>)}
            </select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="booking-check-in" className="text-xs font-semibold text-gray-700">ENTRADA</label>
            <input id="booking-check-in" type="date" value={checkIn} min={today()} className="h-10 px-2 border border-gray-300 rounded-xl text-sm"
              onChange={(e) => { setCheckIn(e.target.value); if (checkOut && checkOut <= e.target.value) setCheckOut(''); setErrors([]); }} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="booking-check-out" className="text-xs font-semibold text-gray-700">SALIDA</label>
            <input id="booking-check-out" type="date" value={checkOut} min={checkIn || today()} className="h-10 px-2 border border-gray-300 rounded-xl text-sm"
              onChange={(e) => { setCheckOut(e.target.value); setErrors([]); }} />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="booking-guests" className="text-xs font-semibold text-gray-700">HUÉSPEDES</label>
          <select id="booking-guests" value={guests} onChange={(e) => setGuests(Number(e.target.value))} className="h-10 px-3 border border-gray-300 rounded-xl text-sm">
            {Array.from({ length: room.capacity }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} huésped{n > 1 ? 'es' : ''}</option>)}
          </select>
        </div>
      </div>

      {errors.length > 0 && (
        <div role="alert" className="mb-3 bg-red-50 border border-red-200 rounded-xl p-3">
          {errors.map((e) => <p key={e} className="text-xs text-red-600">{e}</p>)}
        </div>
      )}

      <Button variant="primary" size="lg" fullWidth onClick={book} className="mb-3">
        {currentUser ? 'Reservar →' : 'Inicia sesión para reservar →'}
      </Button>
      <p className="text-xs text-center text-gray-400 mb-4">No se te cobrará nada todavía</p>
      {nights > 0 && breakdown}

      <div className="mt-4 border-t border-gray-100 pt-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Disponibilidad de {room.name}</h3>
        {blocked.length === 0 ? (
          <p className="text-xs text-gray-500">Sin fechas bloqueadas registradas. La disponibilidad se confirma al reservar.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {blocked.map((p) => (
              <li key={`${p.start}-${p.end}`} className="text-xs text-gray-600">No disponible: {fmt(p.start)} — {fmt(p.end)}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
