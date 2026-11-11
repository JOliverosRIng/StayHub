import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http as mock } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../test/msw/server';
import { mockToken, problem } from '../../../test/msw/handlers';
import { GUEST_ID, OWNER_ID } from '../../../test/msw/fixtures';
import { locationRef, renderWithProviders } from '../../../test/utils';
import { session } from '../../api/session';
import { RequireRole } from '../../app/RequireRole';
import { BookingsReceived } from './BookingsReceived';

/**
 * FE-033 (RQ-08) — owner "bookings received". Driven by the real contract `GET /bookings/history`
 * (OWNER only). Validated against MSW. Access is OWNER-only via RequireRole at the route level.
 */

type User = { id: string; role: 'GUEST' | 'OWNER'; name: string };
const auth = vi.hoisted(() => ({ status: 'authenticated' as string, currentUser: null as User | null }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ ...auth, logout: vi.fn(), retryProfile: vi.fn() }) }));

let token: string | undefined;
beforeEach(() => {
  Object.assign(auth, { status: 'authenticated', currentUser: { id: OWNER_ID, role: 'OWNER', name: 'Olga Ruiz' } });
  token = mockToken('OWNER', OWNER_ID);
  vi.spyOn(session, 'accessToken').mockImplementation(() => token);
});
afterEach(() => vi.restoreAllMocks());

const render = () => renderWithProviders(<BookingsReceived />, { route: '/host/bookings', path: '/host/bookings' });
const renderGuarded = () => renderWithProviders(
  <RequireRole role="OWNER"><BookingsReceived /></RequireRole>, { route: '/host/bookings', path: '/host/bookings' },
);

describe('BookingsReceived — owner history', () => {
  it('lists received bookings with property, guest, total and a text status', async () => {
    render();
    const list = await screen.findByRole('list', { name: 'Reservas recibidas' });
    expect(within(list).getByText('Casa Azul Frente al Mar')).toBeInTheDocument();
    expect(within(list).getByText('Villa Serena Boutique Hotel & Spa')).toBeInTheDocument();
    expect(within(list).getByText('Cabaña del Bosque Nevado')).toBeInTheDocument();
    expect(within(list).getByText('Confirmada')).toBeInTheDocument();
    expect(within(list).getByText('Cancelada por el huésped')).toBeInTheDocument();
    expect(within(list).getAllByText(new RegExp(GUEST_ID)).length).toBeGreaterThan(0);
  });

  it('filters by status', async () => {
    render();
    await screen.findByRole('list', { name: 'Reservas recibidas' });
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'CONFIRMED' } });
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Reservas recibidas' })).queryByText('Villa Serena Boutique Hotel & Spa')).not.toBeInTheDocument());
    expect(within(screen.getByRole('list', { name: 'Reservas recibidas' })).getByText('Casa Azul Frente al Mar')).toBeInTheDocument();
  });

  it('filters by property (client side)', async () => {
    render();
    const list = await screen.findByRole('list', { name: 'Reservas recibidas' });
    expect(within(list).getByText('Villa Serena Boutique Hotel & Spa')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Propiedad'), { target: { value: 'Casa Azul Frente al Mar' } });
    expect(within(screen.getByRole('list', { name: 'Reservas recibidas' })).queryByText('Villa Serena Boutique Hotel & Spa')).not.toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Reservas recibidas' })).getByText('Casa Azul Frente al Mar')).toBeInTheDocument();
  });

  it('shows an empty state when there are no received bookings', async () => {
    token = mockToken('OWNER', '00000000-0000-4000-8000-0000000000b0');
    render();
    expect(await screen.findByText(/Todavía no tienes reservas recibidas/i)).toBeInTheDocument();
  });

  it('shows a loading state before the list arrives', async () => {
    render();
    expect(screen.getByRole('status')).toHaveTextContent('Cargando las reservas…');
    await screen.findByRole('list', { name: 'Reservas recibidas' });
  });

  it('shows the permission error for a non-owner session (403)', async () => {
    token = mockToken('GUEST', GUEST_ID);
    render();
    expect(await screen.findByText('Esta sección es solo para propietarios.')).toBeInTheDocument();
  });

  it('shows a retryable error on a server failure (5xx)', async () => {
    server.use(mock.get('*/api/v1/bookings/history', () => problem(503, 'UNAVAILABLE')));
    render();
    expect(await screen.findByText('No pudimos cargar el historial de reservas. Intenta nuevamente.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});

describe('BookingsReceived — access (OWNER only)', () => {
  it('redirects a guest to home', async () => {
    Object.assign(auth, { status: 'authenticated', currentUser: { id: GUEST_ID, role: 'GUEST', name: 'Ana' } });
    renderGuarded();
    await waitFor(() => expect(locationRef.current?.pathname).toBe('/'));
  });

  it('sends an anonymous visitor to login', async () => {
    Object.assign(auth, { status: 'authenticated', currentUser: null });
    renderGuarded();
    await waitFor(() => expect(locationRef.current?.pathname).toBe('/login'));
  });

  it('renders for an owner', async () => {
    renderGuarded();
    const list = await screen.findByRole('list', { name: 'Reservas recibidas' });
    expect(within(list).getByText('Casa Azul Frente al Mar')).toBeInTheDocument();
  });
});
