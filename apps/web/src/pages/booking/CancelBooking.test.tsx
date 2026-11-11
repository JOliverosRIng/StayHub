import { fireEvent, screen, waitFor } from '@testing-library/react';
import { http as mock } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../test/msw/server';
import { mockToken, problem } from '../../../test/msw/handlers';
import { BOOKING_IDS, GUEST_ID, OWNER_ID } from '../../../test/msw/fixtures';
import { locationRef, renderWithProviders } from '../../../test/utils';
import { session } from '../../api/session';
import { CancelBooking } from './CancelBooking';

/**
 * FE-035 (RQ-09/RQ-10) — cancellation screen, test-first. Mounted at `/bookings/:bookingId/cancel`.
 * The booking (`GET /bookings/:id`) is the source of truth for the summary and whether it is cancelable;
 * the refund result comes from `booking.paymentStatus` after `DELETE /bookings/:id`. The contract
 * defines no deadlines/percentages, so the policy note is generic. Runs against MSW.
 */

type User = { id: string; role: 'GUEST' | 'OWNER'; name: string };
const auth = vi.hoisted(() => ({ status: 'authenticated' as string, currentUser: null as User | null }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ ...auth, logout: vi.fn(), retryProfile: vi.fn() }) }));

let token: string | undefined;
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-11-10T12:00:00.000Z'));
  token = mockToken('GUEST', GUEST_ID);
  vi.spyOn(session, 'accessToken').mockImplementation(() => token);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const asGuest = () => Object.assign(auth, { status: 'authenticated', currentUser: { id: GUEST_ID, role: 'GUEST', name: 'Ana' } });
const asOwner = () => {
  Object.assign(auth, { status: 'authenticated', currentUser: { id: OWNER_ID, role: 'OWNER', name: 'Olga' } });
  token = mockToken('OWNER', OWNER_ID);
};
const cancelRoute = (id: string) => `/bookings/${id}/cancel`;
const renderCancel = (id: string) =>
  renderWithProviders(<CancelBooking />, { route: cancelRoute(id), path: '/bookings/:bookingId/cancel' });

describe('CancelBooking — guest (RQ-09)', () => {
  it('shows the summary and a policy note, confirms once and shows the refund result', async () => {
    asGuest();
    let deletes = 0;
    server.events.on('request:start', ({ request }) => { if (request.method === 'DELETE') deletes += 1; });
    renderCancel(BOOKING_IDS.casaAzulConfirmed);
    expect(await screen.findByText('Casa Azul Frente al Mar')).toBeInTheDocument();
    expect(screen.getByText(/580/)).toBeInTheDocument();
    expect(screen.getByText(/política de cancelación/i)).toBeInTheDocument();

    const confirm = screen.getByRole('button', { name: 'Confirmar cancelación' });
    fireEvent.click(confirm);
    fireEvent.click(confirm); // double click must not cancel twice
    expect(await screen.findByText('Reembolso en proceso.')).toBeInTheDocument();
    server.events.removeAllListeners();
    expect(deletes).toBe(1);
    expect(screen.getByText('Cancelada por el huésped')).toBeInTheDocument();
  });

  it('shows a clear message and no confirm action for a non-cancelable booking', async () => {
    asGuest();
    renderCancel(BOOKING_IDS.villaCompleted); // COMPLETED
    expect(await screen.findByText(/ya no se puede cancelar/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar cancelación' })).not.toBeInTheDocument();
  });

  it('shows a server conflict (409) without breaking the screen', async () => {
    asGuest();
    server.use(mock.delete('*/api/v1/bookings/:bookingId', () => problem(409, 'STATE_CONFLICT')));
    renderCancel(BOOKING_IDS.casaAzulConfirmed);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar cancelación' }));
    expect(await screen.findByText('Esta reserva ya no se puede cancelar.')).toBeInTheDocument();
  });

  it('maps a forbidden cancellation (403) to a clear message', async () => {
    asGuest();
    server.use(mock.delete('*/api/v1/bookings/:bookingId', () => problem(403, 'FORBIDDEN')));
    renderCancel(BOOKING_IDS.casaAzulConfirmed);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar cancelación' }));
    expect(await screen.findByText('No puedes cancelar esta reserva.')).toBeInTheDocument();
  });

  it('shows not-found for a booking the guest cannot see (404)', async () => {
    asGuest();
    renderCancel('00000000-0000-4000-8000-0000000000cc');
    expect(await screen.findByText('No encontramos la reserva.')).toBeInTheDocument();
  });

  it('redirects to login on 401, keeping the destination', async () => {
    asGuest();
    token = undefined;
    renderCancel(BOOKING_IDS.casaAzulConfirmed);
    await waitFor(() => expect(locationRef.current?.pathname).toBe('/login'));
    expect(locationRef.current?.state).toMatchObject({ from: cancelRoute(BOOKING_IDS.casaAzulConfirmed) });
  });
});

describe('CancelBooking — owner (RQ-10)', () => {
  it('requires a non-empty justification before confirming, then shows the result', async () => {
    asOwner();
    renderCancel(BOOKING_IDS.casaAzulConfirmed);
    await screen.findByText('Casa Azul Frente al Mar');
    expect(screen.getByRole('button', { name: 'Confirmar cancelación' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Motivo de la cancelación'), { target: { value: 'Mantenimiento imprevisto.' } });
    const confirm = screen.getByRole('button', { name: 'Confirmar cancelación' });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(await screen.findByText('Reembolso en proceso.')).toBeInTheDocument();
    expect(screen.getByText('Cancelada por el anfitrión')).toBeInTheDocument();
  });

  it('keeps the typed justification if the server fails (5xx)', async () => {
    asOwner();
    server.use(mock.delete('*/api/v1/bookings/:bookingId', () => problem(503, 'UNAVAILABLE')));
    renderCancel(BOOKING_IDS.casaAzulConfirmed);
    await screen.findByText('Casa Azul Frente al Mar');
    fireEvent.change(screen.getByLabelText('Motivo de la cancelación'), { target: { value: 'Motivo de prueba.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelación' }));
    expect(await screen.findByText('No pudimos cancelar la reserva. Intenta nuevamente.')).toBeInTheDocument();
    expect(screen.getByLabelText('Motivo de la cancelación')).toHaveValue('Motivo de prueba.');
  });
});
