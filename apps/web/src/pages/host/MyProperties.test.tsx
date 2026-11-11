import { fireEvent, screen, waitFor } from '@testing-library/react';
import { http as mock } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../test/msw/server';
import { mockToken, problem } from '../../../test/msw/handlers';
import { GUEST_ID, OWNER_ID, PROPERTY_IDS } from '../../../test/msw/fixtures';
import { locationRef, renderWithProviders } from '../../../test/utils';
import { session } from '../../api/session';
import { BookingProvider } from '../../context/BookingContext';
import { AppRoutes } from '../../app/routes';
import { MyProperties } from './MyProperties';

/**
 * FE-023 (RQ-03) — owner "my properties" list, test-first.
 *
 * The list is owner-scoped and includes DRAFT properties, so it cannot come from the public search.
 * The accommodations contract exposes no owner listing yet; these tests drive the provisional
 * `GET /properties?mine=true` mock (External dependency: G1). Access is OWNER-only via RequireRole.
 */

type User = { id: string; role: 'GUEST' | 'OWNER'; name: string };
const auth = vi.hoisted(() => ({
  status: 'authenticated' as string, currentUser: null as User | null,
  login: vi.fn(), register: vi.fn(), logout: vi.fn(), retrySession: vi.fn(), retryProfile: vi.fn(),
}));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));

const owner: User = { id: OWNER_ID, role: 'OWNER', name: 'Olga Ruiz' };
const guest: User = { id: GUEST_ID, role: 'GUEST', name: 'Ana' };
const EMPTY_OWNER = '00000000-0000-4000-8000-0000000000ff';

let token: string | undefined;
beforeEach(() => {
  Object.assign(auth, { status: 'authenticated', currentUser: owner });
  token = mockToken('OWNER', OWNER_ID);
  vi.spyOn(session, 'accessToken').mockImplementation(() => token);
});
afterEach(() => vi.restoreAllMocks());

const renderList = () => renderWithProviders(<MyProperties />, { route: '/host/properties', path: '/host/properties' });

describe('MyProperties list', () => {
  it('shows the owner properties with name, location, status and price', async () => {
    renderList();
    expect(await screen.findByRole('link', { name: /Editar Villa Serena Boutique Hotel & Spa/ })).toBeInTheDocument();
    // Name + location + status for a published property, and the DRAFT shows up too.
    expect(screen.getByText('Casa Azul Frente al Mar')).toBeInTheDocument();
    expect(screen.getByText(/Tulum/)).toBeInTheDocument();
    expect(screen.getAllByText('Publicada').length).toBeGreaterThan(0);
    expect(screen.getByText('Borrador')).toBeInTheDocument();
    // Lowest nightly price of the villa (195 EUR).
    expect(screen.getByText(/195/)).toBeInTheDocument();
  });

  it('links each property to its edit screen', async () => {
    renderList();
    const link = await screen.findByRole('link', { name: 'Editar Casa Azul Frente al Mar' });
    expect(link).toHaveAttribute('href', `/host/properties/${PROPERTY_IDS.casaAzul}/edit`);
  });

  it('shows an empty state with a link to publish when the owner has no properties', async () => {
    token = mockToken('OWNER', EMPTY_OWNER);
    renderList();
    expect(await screen.findByText(/Todavía no publicaste/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Publicar mi primera propiedad' })).toHaveAttribute('href', '/host/new');
  });

  it('shows a loading state before the list arrives', async () => {
    renderList();
    expect(screen.getByText('Cargando tus propiedades…')).toBeInTheDocument();
    await screen.findByRole('link', { name: /Editar Casa Azul Frente al Mar/ });
  });

  it('explains an expired session (401) with a clear message', async () => {
    token = undefined;
    renderList();
    expect(await screen.findByText('Tu sesión venció. Inicia sesión nuevamente.')).toBeInTheDocument();
  });

  it('explains a forbidden response (403)', async () => {
    token = mockToken('GUEST', GUEST_ID);
    renderList();
    expect(await screen.findByText('Esta sección es solo para propietarios.')).toBeInTheDocument();
  });

  it('shows a retryable error on a server failure (5xx) and recovers', async () => {
    server.use(mock.get('*/api/v1/properties', () => problem(503, 'UNAVAILABLE'), { once: true }));
    renderList();
    expect(await screen.findByText('No pudimos cargar tus propiedades. Intenta nuevamente.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('link', { name: /Editar Casa Azul Frente al Mar/ })).toBeInTheDocument();
  });
});

describe('MyProperties access (OWNER only)', () => {
  const renderAt = (route: string) => renderWithProviders(<BookingProvider><AppRoutes /></BookingProvider>, { route });

  it('redirects a guest away from the owner listing', async () => {
    Object.assign(auth, { status: 'authenticated', currentUser: guest });
    renderAt('/host/properties');
    await waitFor(() => expect(locationRef.current?.pathname).toBe('/'));
    expect(screen.queryByRole('heading', { name: 'Mis propiedades' })).not.toBeInTheDocument();
  });

  it('renders the listing for an owner', async () => {
    renderAt('/host/properties');
    expect(await screen.findByRole('heading', { name: 'Mis propiedades' })).toBeInTheDocument();
  });
});
