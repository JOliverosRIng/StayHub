import React, { createContext, useContext, useState } from 'react';
import { Booking } from '../types';

const BOOKINGS_KEY = 'stayhub_bookings';

interface BookingContextType {
  bookings: Booking[];
  createBooking: (data: Omit<Booking, 'id' | 'createdAt'>) => Booking;
  cancelBooking: (bookingId: string) => void;
  getUserBookings: (userId: string) => Booking[];
  getBlockedRanges: (roomId: string) => Array<{ start: Date; end: Date }>;
  isRangeAvailable: (roomId: string, checkIn: string, checkOut: string, excludeBookingId?: string) => boolean;
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
      value={{ bookings, createBooking, cancelBooking, getUserBookings, getBlockedRanges, isRangeAvailable }}
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
