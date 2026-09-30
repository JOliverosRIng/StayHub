import React, { useState } from 'react';
import { Header } from '../components/Header';
import { Button } from '../components/Button';
import { useAuth } from '../context/AuthContext';
import { useBookings } from '../context/BookingContext';
import { Booking } from '../types';

interface MyBookingsProps {
  onNavigate: (page: string, id?: string) => void;
}

function fmt(date: string) {
  if (!date) return '';
  const [y, m, d] = date.split('-');
  const months = ['enero', 'feb', 'mar', 'abr', 'mayo', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

function BookingCard({ booking, onCancel }: { booking: Booking; onCancel: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const isConfirmed = booking.status === 'confirmed';
  const isPast = booking.checkOut < new Date().toISOString().split('T')[0];

  return (
    <div className={`border rounded-2xl overflow-hidden transition-all ${isConfirmed ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
      <div className="flex flex-col sm:flex-row">
        {/* Image */}
        <div className="sm:w-48 h-40 sm:h-auto shrink-0 bg-gray-100">
          <img src={booking.roomImage} alt={booking.roomTitle} className="w-full h-full object-cover" />
        </div>

        {/* Details */}
        <div className="flex-1 p-5 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
                  !isConfirmed ? 'bg-gray-100 text-gray-500' :
                  isPast ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-700'
                }`}>
                  {!isConfirmed ? (
                    <><span className="w-1.5 h-1.5 bg-gray-400 rounded-full" />Cancelada</>
                  ) : isPast ? (
                    <><span className="w-1.5 h-1.5 bg-gray-500 rounded-full" />Completada</>
                  ) : (
                    <><span className="w-1.5 h-1.5 bg-green-500 rounded-full" />Confirmada</>
                  )}
                </span>
              </div>
              <h3 className="text-base font-bold text-gray-900 leading-snug">{booking.roomTitle}</h3>
              <p className="text-sm text-gray-500">{booking.roomLocation}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-lg font-bold text-gray-900">${booking.totalPrice}</p>
              <p className="text-xs text-gray-400">total pagado</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
              <span className="text-sm text-gray-700">
                {fmt(booking.checkIn)} → {fmt(booking.checkOut)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
              <span className="text-sm text-gray-700">{booking.guests} huésped{booking.guests > 1 ? 'es' : ''}</span>
            </div>
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
              <span className="text-sm text-gray-700">{booking.nights} noche{booking.nights > 1 ? 's' : ''}</span>
            </div>
          </div>

          {/* Price breakdown */}
          <div className="bg-gray-50 rounded-xl px-4 py-3 flex flex-wrap gap-4 text-xs text-gray-500">
            <span>Alojamiento: <strong className="text-gray-700">${booking.accommodationFee}</strong></span>
            <span>Limpieza: <strong className="text-gray-700">${booking.cleaningFee}</strong></span>
            <span>Servicio: <strong className="text-gray-700">${booking.serviceFee}</strong></span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 mt-1">
            {isConfirmed && !isPast && !confirming && (
              <button
                onClick={() => setConfirming(true)}
                className="text-sm font-semibold text-red-500 hover:text-red-700 hover:underline transition-colors"
              >
                Cancelar reserva
              </button>
            )}
            {confirming && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">¿Confirmas la cancelación?</span>
                <button
                  onClick={() => { onCancel(); setConfirming(false); }}
                  className="text-sm font-semibold text-white bg-red-500 px-3 py-1.5 rounded-lg hover:bg-red-600 transition-colors"
                >
                  Sí, cancelar
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="text-sm text-gray-500 hover:underline"
                >
                  No, volver
                </button>
              </div>
            )}
            <span className="text-xs text-gray-400 ml-auto">
              Reserva #{booking.id.slice(-6).toUpperCase()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MyBookings({ onNavigate }: MyBookingsProps) {
  const { currentUser } = useAuth();
  const { getUserBookings, cancelBooking } = useBookings();
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'cancelled'>('all');

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <Header onNavigate={onNavigate} />
        <div className="flex-1 flex flex-col items-center justify-center py-24 text-center px-6">
          <span className="text-5xl mb-4">🔒</span>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Inicia sesión para ver tus reservas</h2>
          <p className="text-gray-500 text-sm mb-6">Necesitas una cuenta para acceder a esta sección.</p>
          <Button variant="primary" size="lg" onClick={() => onNavigate('login')}>Iniciar sesión</Button>
        </div>
      </div>
    );
  }

  const allBookings = getUserBookings(currentUser.id).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const filtered = allBookings.filter((b) => {
    if (filter === 'confirmed') return b.status === 'confirmed';
    if (filter === 'cancelled') return b.status === 'cancelled';
    return true;
  });

  const confirmedCount = allBookings.filter((b) => b.status === 'confirmed').length;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header onNavigate={onNavigate} />

      <main className="flex-1 max-w-screen-lg mx-auto px-6 py-10 w-full">
        {/* Page header */}
        <div className="mb-8">
          <p className="text-sm text-[#E31C5F] font-semibold mb-1">Tu cuenta</p>
          <h1 className="text-3xl font-bold text-gray-900">Mis reservas</h1>
          <p className="text-gray-500 text-sm mt-1">
            Hola, <strong>{currentUser.name.split(' ')[0]}</strong> · {confirmedCount} reserva{confirmedCount !== 1 ? 's' : ''} activa{confirmedCount !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          {([['all', 'Todas'], ['confirmed', 'Confirmadas'], ['cancelled', 'Canceladas']] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                filter === val
                  ? 'border-[#E31C5F] text-[#E31C5F]'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {label}
              <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                {val === 'all' ? allBookings.length : allBookings.filter((b) => b.status === (val === 'confirmed' ? 'confirmed' : 'cancelled')).length}
              </span>
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <span className="text-5xl mb-4">🧳</span>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              {allBookings.length === 0 ? 'Todavía no tienes reservas' : 'Sin reservas en esta categoría'}
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              {allBookings.length === 0
                ? 'Explora miles de alojamientos únicos y haz tu primera reserva.'
                : 'Prueba cambiando el filtro para ver otras reservas.'}
            </p>
            <Button variant="primary" size="lg" onClick={() => onNavigate('home')}>
              Explorar alojamientos
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filtered.map((b) => (
              <BookingCard
                key={b.id}
                booking={b}
                onCancel={() => cancelBooking(b.id)}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-gray-200 mt-8">
        <div className="max-w-screen-xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-gray-500">© 2026 StayHub, Inc. · Privacidad · Condiciones</p>
          <span className="text-sm text-gray-500">🌐 Español (ES)</span>
        </div>
      </footer>
    </div>
  );
}
