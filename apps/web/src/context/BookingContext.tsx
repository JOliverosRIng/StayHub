import React, { createContext, useContext, useState } from 'react';
import { Booking } from '../types';
import type { BasePrice } from '../types/catalog';

const BOOKINGS_KEY = 'stayhub_bookings';

// ---------------------------------------------------------------------------
// RQ-07 booking flow — pure, reusable date/total helpers (no fees; the backend total is
// `precio × noches`, see booking_service/spec.md §48/§138). `[checkIn, checkOut)` half-open.
// ---------------------------------------------------------------------------

/** Nights between two `YYYY-MM-DD` dates; 0 when missing or non-positive. */
export function countNights(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  const ms = new Date(`${checkOut}T00:00:00`).getTime() - new Date(`${checkIn}T00:00:00`).getTime();
  return ms > 0 ? Math.round(ms / 86_400_000) : 0;
}

/** Decimal string total `amount × nights` with 2 fractional digits (no extra fees). */
export function bookingTotalAmount(nightlyAmount: string, nights: number): string {
  return (Number(nightlyAmount) * nights).toFixed(2);
}

export interface StayDateErrors { checkIn?: string; checkOut?: string }

/** Client-side date validation mirroring the contract; `today` is `YYYY-MM-DD`. */
export function validateStayDates(checkIn: string, checkOut: string, today: string): StayDateErrors {
  const errors: StayDateErrors = {};
  if (!checkIn) errors.checkIn = 'Selecciona la fecha de entrada';
  else if (checkIn < today) errors.checkIn = 'La fecha de entrada no puede ser en el pasado';
  if (!checkOut) errors.checkOut = 'Selecciona la fecha de salida';
  else if (checkIn && checkOut <= checkIn) errors.checkOut = 'La fecha de salida debe ser posterior a la de entrada';
  return errors;
}

/** In-memory draft of the guest's selection + computed summary (never persisted). */
export interface BookingSelection {
  propertyId: string;
  propertyName: string;
  roomId: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  nights: number;
  nightlyPrice: BasePrice;
  total: BasePrice;
}

interface BookingContextType {
  bookings: Booking[];
  createBooking: (data: Omit<Booking, 'id' | 'createdAt'>) => Booking;
  cancelBooking: (bookingId: string) => void;
  getUserBookings: (userId: string) => Booking[];
  getBlockedRanges: (roomId: string) => Array<{ start: Date; end: Date }>;
  isRangeAvailable: (roomId: string, checkIn: string, checkOut: string, excludeBookingId?: string) => boolean;
  /** RQ-07: current booking draft kept across the flow steps; cleared on finish/cancel. */
  draft: BookingSelection | null;
  setDraft: (selection: BookingSelection) => void;
  clearDraft: () => void;
}

const BookingContext = createContext<BookingContextType | null>(null);

function loadBookings(): Booking[] {
  try {
    return JSON.parse(localStorage.getItem(BOOKINGS_KEY) || '[]');
  } catch {
    return [];
  }
}

export function BookingProvider({ children }: { children: React.ReactNode }) {
  const [bookings, setBookings] = useState<Booking[]>(loadBookings);
  const [draft, setDraftState] = useState<BookingSelection | null>(null);

  const persist = (updated: Booking[]) => {
    setBookings(updated);
    localStorage.setItem(BOOKINGS_KEY, JSON.stringify(updated));
  };

  const createBooking = (data: Omit<Booking, 'id' | 'createdAt'>): Booking => {
    const booking: Booking = {
      ...data,
      id: `booking_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      createdAt: new Date().toISOString(),
    };
    persist([...bookings, booking]);
    return booking;
  };

  const cancelBooking = (bookingId: string) => {
    persist(
      bookings.map((b) =>
        b.id === bookingId ? { ...b, status: 'cancelled' } : b
      )
    );
  };

  const getUserBookings = (userId: string) =>
    bookings.filter((b) => b.userId === userId);

  const getBlockedRanges = (roomId: string) =>
    bookings
      .filter((b) => b.roomId === roomId && b.status === 'confirmed')
      .map((b) => ({
        start: new Date(b.checkIn + 'T00:00:00'),
        end: new Date(b.checkOut + 'T00:00:00'),
      }));

  const isRangeAvailable = (
    roomId: string,
    checkIn: string,
    checkOut: string,
    excludeBookingId?: string
  ): boolean => {
    const newStart = new Date(checkIn + 'T00:00:00');
    const newEnd = new Date(checkOut + 'T00:00:00');
    return !bookings
      .filter((b) => b.roomId === roomId && b.status === 'confirmed' && b.id !== excludeBookingId)
      .some((b) => {
        const s = new Date(b.checkIn + 'T00:00:00');
        const e = new Date(b.checkOut + 'T00:00:00');
        return newStart < e && newEnd > s;
      });
  };

  return (
    <BookingContext.Provider
      value={{
        bookings, createBooking, cancelBooking, getUserBookings, getBlockedRanges, isRangeAvailable,
        draft, setDraft: setDraftState, clearDraft: () => setDraftState(null),
      }}
    >
      {children}
    </BookingContext.Provider>
  );
}

export function useBookings() {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error('useBookings must be used within BookingProvider');
  return ctx;
}
