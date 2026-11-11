import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http as mock } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../test/msw/server';
import { mockToken, problem } from '../../test/msw/handlers';
import { GUEST_ID } from '../../test/msw/fixtures';
import { renderWithProviders } from '../../test/utils';
import { session } from '../api/session';
import { MyBookings } from './MyBookings';

/**
 * FE-033 (RQ-08) — guest "my bookings". The guest list comes from a PROVISIONAL `GET /bookings`
 * (the contract has no guest history list); validated against MSW. Access: the page prompts anonymous
 * visitors to sign in (kept from the previous screen, relied on by App.test).
 */

type User = { id: string; role: 'GUEST' | 'OWNER'; name: string };
const auth = vi.hoisted(() => ({ status: 'authenticated' as string, currentUser: null as User | null }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ ...auth, logout: vi.fn(), retryProfile: vi.fn() }) }));

let token: string | undefined;
beforeEach(() => {
  Object.assign(auth, { status: 'authenticated', currentUser: { id: GUEST_ID, role: 'GUEST', name: 'Ana Pérez' } });
  token = mockToken('GUEST', GUEST_ID);
  vi.spyOn(session, 'accessToken').mockImplementation(() => token);
});
afterEach(() => vi.restoreAllMocks());

const renderMyBookings = () =>
  renderWithProviders(<MyBookings onNavigate={vi.fn()} />, { route: '/bookings', path: '/bookings' });

describe('MyBookings — guest history', () => {
  it('lists the guest bookings with property, dates, guests, total and a text status', async () => {
    renderMyBookings();
    const list = await screen.findByRole('list', { name: 'Reservas' });
    expect(within(list).getByText('Casa Azul Frente al Mar')).toBeInTheDocument();
    expect(within(list).getByText('Villa Serena Boutique Hotel & Spa')).toBeInTheDocument();
    expect(within(list).getByText('Confirmada')).toBeInTheDocument(); // text, not color only
    expect(within(list).getByText('Completada')).toBeInTheDocument();
    expect(within(list).getByText(/580/)).toBeInTheDocument(); // Casa Azul total
  });

  it('filters by status', async () => {
    renderMyBookings();
    await screen.findByRole('list', { name: 'Reservas' });
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'CONFIRMED' } });
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Reservas' })).queryByText('Villa Serena Boutique Hotel & Spa')).not.toBeInTheDocument());
    expect(within(screen.getByRole('list', { name: 'Reservas' })).getByText('Casa Azul Frente al Mar')).toBeInTheDocument();
  });

  it('filters by check-in date range', async () => {
    renderMyBookings();
    const list = await screen.findByRole('list', { name: 'Reservas' });
    expect(within(list).getByText('Villa Serena Boutique Hotel & Spa')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-12-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-12-31' } });
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Reservas' })).queryByText('Villa Serena Boutique Hotel & Spa')).not.toBeInTheDocument());
    expect(within(screen.getByRole('list', { name: 'Reservas' })).getByText('Casa Azul Frente al Mar')).toBeInTheDocument();
  });

  it('shows an empty state with a link to search', async () => {
    token = mockToken('GUEST', '00000000-0000-4000-8000-0000000000a0');
    renderMyBookings();
    expect(await screen.findByText(/Todavía no tienes reservas/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Buscar/i })).toHaveAttribute('href', '/search');
  });

  it('shows a loading state before the list arrives', async () => {
    renderMyBookings();
    expect(screen.getByRole('status')).toHaveTextContent('Cargando tus reservas…');
    await screen.findByText('Casa Azul Frente al Mar');
  });

  it('shows an error when the session expired (401)', async () => {
    token = undefined;
    renderMyBookings();
    expect(await screen.findByText('Tu sesión venció. Inicia sesión nuevamente.')).toBeInTheDocument();
  });

  it('shows a retryable error on a server failure (5xx)', async () => {
    server.use(mock.get('*/api/v1/bookings', () => problem(503, 'UNAVAILABLE')));
    renderMyBookings();
    expect(await screen.findByText('No pudimos cargar el historial de reservas. Intenta nuevamente.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('prompts anonymous visitors to sign in', () => {
    Object.assign(auth, { status: 'authenticated', currentUser: null });
    renderMyBookings();
    expect(screen.getByRole('heading', { name: 'Inicia sesión para ver tus reservas' })).toBeInTheDocument();
  });
});
