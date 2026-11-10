import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { PendingBookingData } from '../types';

/** Canonical client paths. Keep in sync with `routes.tsx`. */
export const paths = {
  home: '/',
  login: '/login',
  register: '/register',
  search: '/search',
  property: (id: string) => `/property/${encodeURIComponent(id)}`,
  bookings: '/bookings',
  host: '/host',
  hostNew: '/host/new',
} as const;

/** Router state shapes carried between routes (never persisted, never contains credentials). */
export interface LoginLocationState { from?: string; pendingBooking?: PendingBookingData; registeredEmail?: string; notice?: string }
export interface DetailLocationState { pendingBooking?: PendingBookingData }
export interface NoticeLocationState { notice?: string }

/** Accepts only same-app paths to prevent open redirects through `from`. */
export function safeReturnPath(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return undefined;
  if (value.startsWith(paths.login) || value.startsWith(paths.register)) return undefined;
  return value;
}

/**
 * Adapter for pages that still receive `onNavigate(page, id)`. Login/register links remember the
 * current location so the user returns there after authenticating.
 */
export function useLegacyNavigate(): (page: string, id?: string) => void {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback((page: string, id?: string) => {
    const here = `${location.pathname}${location.search}`;
    switch (page) {
      case 'login':
      case 'register': {
        const current = location.state as LoginLocationState | null;
        const from = safeReturnPath(here) ?? current?.from;
        navigate(page === 'login' ? paths.login : paths.register, { state: { from } satisfies LoginLocationState });
        return;
      }
      case 'detail': navigate(id ? paths.property(id) : paths.search); return;
      case 'bookings': navigate(paths.bookings); return;
      case 'search': navigate(paths.search); return;
      case 'host': navigate(paths.host); return;
      case 'host/new': navigate(paths.hostNew); return;
      default: navigate(paths.home);
    }
  }, [navigate, location]);
}
