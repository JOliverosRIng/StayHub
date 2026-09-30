import React, { useState, useEffect } from 'react';
import { Header } from '../components/Header';
import { Button } from '../components/Button';
import { ROOMS } from '../data/rooms';
import { useAuth } from '../context/AuthContext';
import { useBookings } from '../context/BookingContext';
import { PendingBookingData } from '../types';

interface PropertyDetailProps {
  onNavigate: (page: string, id?: string) => void;
  roomId?: string;
  pendingBooking?: PendingBookingData | null;
  onBookingRequired: (data: PendingBookingData) => void;
  onBookingConfirmed: () => void;
}

function fmt(date: string) {
  if (!date) return '';
  const [y, m, d] = date.split('-');
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

function diffDays(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

const today = new Date().toISOString().split('T')[0];

export function PropertyDetail({ onNavigate, roomId, pendingBooking, onBookingRequired, onBookingConfirmed }: PropertyDetailProps) {
  const { currentUser } = useAuth();
  const { createBooking, getBlockedRanges, isRangeAvailable } = useBookings();

  const room = ROOMS.find((r) => r.id === roomId) ?? ROOMS[0];

  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guestsCount, setGuestsCount] = useState(1);
  const [bookingErrors, setBookingErrors] = useState<string[]>([]);
  const [step, setStep] = useState<'form' | 'confirming' | 'done'>('form');
  const [saved, setSaved] = useState(false);

  // When pendingBooking arrives (user just logged in), pre-fill and show confirmation
  useEffect(() => {
    if (pendingBooking && pendingBooking.roomId === room.id) {
      setCheckIn(pendingBooking.checkIn);
      setCheckOut(pendingBooking.checkOut);
      setGuestsCount(pendingBooking.guests);
      setStep('confirming');
    }
  }, [pendingBooking, room.id]);

  const blockedRanges = getBlockedRanges(room.id);

  const blockedPeriods = blockedRanges.map((r) => ({
    start: r.start.toISOString().split('T')[0],
    end: new Date(r.end.getTime() - 86400000).toISOString().split('T')[0],
  }));

  const nights = checkIn && checkOut ? diffDays(checkIn, checkOut) : 0;
  const accommodationFee = nights * room.pricePerNight;
  const serviceFee = Math.round(accommodationFee * 0.1);
  const total = accommodationFee + room.cleaningFee + serviceFee;

  const buildPending = (): PendingBookingData => ({
    roomId: room.id,
    checkIn,
    checkOut,
    guests: guestsCount,
    nights,
    pricePerNight: room.pricePerNight,
    accommodationFee,
    cleaningFee: room.cleaningFee,
    serviceFee,
    totalPrice: total,
  });

  const validate = (): string[] => {
    const errs: string[] = [];
    if (!checkIn) errs.push('Selecciona la fecha de entrada');
    else if (checkIn < today) errs.push('La fecha de entrada no puede ser en el pasado');
    if (!checkOut) errs.push('Selecciona la fecha de salida');
    else if (checkOut <= checkIn) errs.push('La fecha de salida debe ser posterior a la de entrada');
    if (checkIn && checkOut && checkOut > checkIn) {
      if (!isRangeAvailable(room.id, checkIn, checkOut)) {
        errs.push('Las fechas seleccionadas se solapan con una reserva existente');
      }
    }
    return errs;
  };

  const handleBook = () => {
    const errs = validate();
    if (errs.length) { setBookingErrors(errs); return; }
    setBookingErrors([]);
    if (!currentUser) {
      onBookingRequired(buildPending());
      return;
    }
    setStep('confirming');
  };

  const handleConfirm = () => {
    if (!currentUser) return;
    createBooking({
      userId: currentUser.id,
      roomId: room.id,
      roomTitle: room.title,
      roomImage: room.images[0],
      roomLocation: room.location,
      checkIn,
      checkOut,
      guests: guestsCount,
      nights,
      pricePerNight: room.pricePerNight,
      accommodationFee,
      cleaningFee: room.cleaningFee,
      serviceFee,
      totalPrice: total,
      status: 'confirmed',
    });
    onBookingConfirmed();
    setStep('done');
  };

  return (
    <div className="min-h-screen bg-white">
      <Header onNavigate={onNavigate} />

      <main className="max-w-screen-xl mx-auto px-6 py-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
          <button onClick={() => onNavigate('home')} className="hover:underline">Inicio</button>
          <span>/</span>
          <span className="text-gray-900 font-medium truncate">{room.title}</span>
        </div>

        {/* Title row */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{room.title}</h1>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <div className="flex items-center gap-1">
                <svg viewBox="0 0 20 20" className="w-4 h-4 fill-[#E31C5F]"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                <span className="text-sm font-semibold text-gray-900">{room.rating}</span>
                <span className="text-sm text-gray-500">({room.reviewCount} reseñas)</span>
              </div>
              <span className="text-gray-300">·</span>
              <span className="text-sm text-gray-700">{room.location}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setSaved((s) => !s)}
              className="flex items-center gap-1.5 text-sm text-gray-700 hover:text-gray-900"
            >
              <svg viewBox="0 0 24 24" className={`w-4 h-4 ${saved ? 'fill-[#E31C5F] stroke-[#E31C5F]' : 'fill-none stroke-gray-700'}`} strokeWidth={2}>
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              {saved ? 'Guardado' : 'Guardar'}
            </button>
          </div>
        </div>

        {/* Gallery */}
        <div className={`grid gap-2 rounded-2xl overflow-hidden mb-10 h-72 md:h-96 ${room.images.length >= 4 ? 'grid-cols-4 grid-rows-2' : 'grid-cols-2'}`}>
          <div className="col-span-2 row-span-2">
            <img src={room.images[0]} alt={room.title} className="w-full h-full object-cover" />
          </div>
          {room.images.slice(1, 5).map((src, i) => (
            <div key={i} className="relative overflow-hidden">
              <img src={src} alt={`Vista ${i + 2}`} className="w-full h-full object-cover" />
            </div>
          ))}
        </div>

        {/* Content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-12">
          {/* Left column */}
          <div>
            {/* Host / summary */}
            <div className="flex items-center justify-between pb-6 border-b border-gray-200 mb-6">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{room.title}</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {room.maxGuests} huéspedes · {room.beds} cama{room.beds > 1 ? 's' : ''} · {room.bathrooms} baño{room.bathrooms > 1 ? 's' : ''}
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-[#E31C5F] flex items-center justify-center text-white text-lg font-bold shrink-0">
                S
              </div>
            </div>

            {/* Highlights */}
            <div className="flex flex-col gap-4 pb-6 border-b border-gray-200 mb-6">
              {[
                { icon: '🔑', title: 'Llegada autónoma 24/7', desc: 'Accede a cualquier hora con llave digital.' },
                { icon: '✅', title: 'Cancelación flexible garantizada', desc: 'Cancela sin costo hasta 48 horas antes.' },
                { icon: '🏅', title: 'Anfitrión verificado', desc: 'Identidad y propiedad verificadas por StayHub.' },
              ].map((h) => (
                <div key={h.title} className="flex items-start gap-4">
                  <span className="text-2xl">{h.icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{h.title}</p>
                    <p className="text-sm text-gray-500">{h.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Description */}
            <div className="pb-6 border-b border-gray-200 mb-6">
              <h3 className="text-lg font-bold text-gray-900 mb-3">Sobre este alojamiento</h3>
              <p className="text-sm text-gray-700 leading-relaxed">{room.description}</p>
            </div>

            {/* Amenities */}
            <div className="pb-6 border-b border-gray-200 mb-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Lo que ofrece este lugar</h3>
              <div className="grid grid-cols-2 gap-3">
                {room.amenities.map((a) => (
                  <div key={a} className="flex items-center gap-2 text-sm text-gray-700">
                    <span className="text-green-500">✓</span>
                    {a}
                  </div>
                ))}
              </div>
            </div>

            {/* Blocked dates info */}
            {blockedPeriods.length > 0 && (
              <div className="pb-6 border-b border-gray-200 mb-6">
                <h3 className="text-lg font-bold text-gray-900 mb-3">Fechas no disponibles</h3>
                <div className="flex flex-col gap-2">
                  {blockedPeriods.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="w-2 h-2 bg-[#E31C5F] rounded-full shrink-0" />
                      <span className="text-gray-600">{fmt(p.start)} — {fmt(p.end)}</span>
                      <span className="text-gray-400">(reservado)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column — booking card */}
          <div>
            <div className="sticky top-24">
              {step === 'done' ? (
                <div className="border border-green-200 bg-green-50 rounded-3xl p-8 text-center">
                  <span className="text-5xl block mb-4">🎉</span>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">¡Reserva confirmada!</h3>
                  <p className="text-sm text-gray-600 mb-6">Tu reserva en <strong>{room.title}</strong> ha sido guardada exitosamente.</p>
                  <Button variant="primary" size="lg" fullWidth onClick={() => onNavigate('bookings')}>
                    Ver mis reservas
                  </Button>
                  <button onClick={() => { setStep('form'); setCheckIn(''); setCheckOut(''); }} className="mt-3 text-sm text-gray-500 hover:underline block w-full text-center">
                    Hacer otra reserva
                  </button>
                </div>
              ) : step === 'confirming' ? (
                <div className="border border-gray-200 rounded-3xl shadow-xl p-6">
                  <div className="flex items-center gap-3 mb-5">
                    <button onClick={() => setStep('form')} className="text-gray-500 hover:text-gray-800">
                      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="15 18 9 12 15 6" /></svg>
                    </button>
                    <h3 className="text-lg font-bold text-gray-900">Confirma tu reserva</h3>
                  </div>

                  <div className="bg-gray-50 rounded-2xl p-4 flex gap-4 mb-5">
                    <img src={room.images[0]} alt={room.title} className="w-20 h-20 rounded-xl object-cover shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900 leading-snug">{room.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{room.location}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <svg viewBox="0 0 20 20" className="w-3 h-3 fill-[#E31C5F]"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                        <span className="text-xs font-medium">{room.rating}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 mb-5">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Entrada</span>
                      <span className="font-medium text-gray-900">{fmt(checkIn)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Salida</span>
                      <span className="font-medium text-gray-900">{fmt(checkOut)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Huéspedes</span>
                      <span className="font-medium text-gray-900">{guestsCount} persona{guestsCount > 1 ? 's' : ''}</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 border-t border-gray-100 pt-4 mb-5">
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>${room.pricePerNight} × {nights} noches</span>
                      <span>${accommodationFee}</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Tarifa de limpieza</span>
                      <span>${room.cleaningFee}</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Tarifa de servicio (10%)</span>
                      <span>${serviceFee}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-gray-900 border-t border-gray-200 pt-3 mt-1">
                      <span>Total</span>
                      <span>${total}</span>
                    </div>
                  </div>

                  <Button variant="primary" size="lg" fullWidth onClick={handleConfirm}>
                    Confirmar reserva
                  </Button>
                  <p className="text-xs text-center text-gray-400 mt-3">No se realizará ningún cargo real</p>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-3xl shadow-xl p-6">
                  <div className="flex items-baseline justify-between mb-4">
                    <div>
                      <span className="text-2xl font-bold text-gray-900">${room.pricePerNight}</span>
                      <span className="text-gray-500 text-sm"> / noche</span>
                    </div>
                    <div className="flex items-center gap-1 text-sm">
                      <svg viewBox="0 0 20 20" className="w-4 h-4 fill-gray-900"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                      <span className="font-semibold">{room.rating}</span>
                      <span className="text-gray-500">({room.reviewCount})</span>
                    </div>
                  </div>

                  {/* Date & guests inputs */}
                  <div className="border border-gray-300 rounded-2xl overflow-hidden mb-3">
                    <div className="grid grid-cols-2">
                      <div className="p-3 border-r border-gray-200">
                        <p className="text-xs font-semibold text-gray-700 mb-1">ENTRADA</p>
                        <input
                          type="date"
                          value={checkIn}
                          min={today}
                          onChange={(e) => {
                            setCheckIn(e.target.value);
                            if (checkOut && checkOut <= e.target.value) setCheckOut('');
                            setBookingErrors([]);
                          }}
                          className="text-sm text-gray-900 outline-none w-full bg-transparent cursor-pointer"
                        />
                      </div>
                      <div className="p-3">
                        <p className="text-xs font-semibold text-gray-700 mb-1">SALIDA</p>
                        <input
                          type="date"
                          value={checkOut}
                          min={checkIn || today}
                          onChange={(e) => { setCheckOut(e.target.value); setBookingErrors([]); }}
                          className="text-sm text-gray-900 outline-none w-full bg-transparent cursor-pointer"
                        />
                      </div>
                    </div>
                    <div className="border-t border-gray-200 p-3">
                      <p className="text-xs font-semibold text-gray-700 mb-1">HUÉSPEDES</p>
                      <select
                        value={guestsCount}
                        onChange={(e) => setGuestsCount(Number(e.target.value))}
                        className="text-sm text-gray-900 outline-none w-full bg-transparent cursor-pointer"
                      >
                        {Array.from({ length: room.maxGuests }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>{n} huésped{n > 1 ? 'es' : ''}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {bookingErrors.length > 0 && (
                    <div className="mb-3 bg-red-50 border border-red-200 rounded-xl p-3">
                      {bookingErrors.map((e, i) => (
                        <p key={i} className="text-xs text-red-600">{e}</p>
                      ))}
                    </div>
                  )}

                  <Button variant="primary" size="lg" fullWidth onClick={handleBook} className="mb-3">
                    {currentUser ? 'Reservar →' : 'Inicia sesión para reservar →'}
                  </Button>
                  <p className="text-xs text-center text-gray-400 mb-4">No se te cobrará nada todavía</p>

                  {nights > 0 && (
                    <div className="flex flex-col gap-2 border-t border-gray-100 pt-4">
                      <div className="flex justify-between text-sm text-gray-700">
                        <span>${room.pricePerNight} × {nights} noches</span>
                        <span>${accommodationFee}</span>
                      </div>
                      <div className="flex justify-between text-sm text-gray-700">
                        <span>Tarifa de limpieza</span>
                        <span>${room.cleaningFee}</span>
                      </div>
                      <div className="flex justify-between text-sm text-gray-700">
                        <span>Tarifa de servicio (10%)</span>
                        <span>${serviceFee}</span>
                      </div>
                      <div className="flex justify-between text-sm font-bold text-gray-900 border-t border-gray-200 pt-3 mt-1">
                        <span>Total</span>
                        <span>${total}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-200 mt-16">
        <div className="max-w-screen-xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-gray-500">© 2026 StayHub, Inc. · Privacidad · Condiciones</p>
          <span className="text-sm text-gray-500">🌐 Español (ES)</span>
        </div>
      </footer>
    </div>
  );
}
