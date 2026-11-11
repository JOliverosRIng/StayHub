import { screen, within } from '@testing-library/react';
import { http as mock } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../test/msw/server';
import { mockToken, problem } from '../../test/msw/handlers';
import { GUEST_ID, OTHER_GUEST_ID, PROPERTY_IDS } from '../../test/msw/fixtures';
import { renderWithProviders } from '../../test/utils';
import { session } from '../api/session';
import { MyReviews } from './MyReviews';

/**
 * FE-038 (RQ-11) — the guest's own reviews view. Data from `GET /reviews/user/:id` (MSW). Access: the
 * page prompts anonymous visitors and the GET enforces that a user only lists their own reviews.
 */

type User = { id: string; role: 'GUEST' | 'OWNER'; name: string };
const auth = vi.hoisted(() => ({ status: 'authenticated' as string, currentUser: null as User | null }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ ...auth, logout: vi.fn(), retryProfile: vi.fn() }) }));

let token: string | undefined;
beforeEach(() => {
  Object.assign(auth, { status: 'authenticated', currentUser: { id: GUEST_ID, role: 'GUEST', name: 'Ana' } });
  token = mockToken('GUEST', GUEST_ID);
  vi.spyOn(session, 'accessToken').mockImplementation(() => token);
});
afterEach(() => vi.restoreAllMocks());

const render = () => renderWithProviders(<MyReviews onNavigate={vi.fn()} />, { route: '/reviews', path: '/reviews' });

describe('MyReviews', () => {
  it('lists the reviews written by the user with stars, comment, date and a link to the property', async () => {
    render();
    const list = await screen.findByRole('list', { name: 'Mis reseñas' });
    expect(within(list).getByText('Volveremos sin duda.')).toBeInTheDocument();
    expect(within(list).getAllByRole('img', { name: /de 5 estrellas/ }).length).toBeGreaterThan(0);
    expect(within(list).getAllByRole('link', { name: 'Ver alojamiento' }).map((a) => a.getAttribute('href')))
      .toContain(`/property/${PROPERTY_IDS.villa}`);
  });

  it('shows an empty state with a link to the bookings', async () => {
    Object.assign(auth, { currentUser: { id: OTHER_GUEST_ID, role: 'GUEST', name: 'Otro' } });
    token = mockToken('GUEST', OTHER_GUEST_ID);
    render();
    expect(await screen.findByText(/Todavía no has escrito reseñas/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver mis reservas/i })).toHaveAttribute('href', '/bookings');
  });

  it('shows a loading state before the list arrives', async () => {
    render();
    expect(screen.getByRole('status')).toHaveTextContent('Cargando tus reseñas…');
    await screen.findByRole('list', { name: 'Mis reseñas' });
  });

  it('shows an expired-session error (401)', async () => {
    token = undefined;
    render();
    expect(await screen.findByText('Tu sesión venció. Inicia sesión nuevamente.')).toBeInTheDocument();
  });

  it('shows a retryable error on a server failure (5xx or 403)', async () => {
    server.use(mock.get('*/api/v1/reviews/user/:userId', () => problem(503, 'UNAVAILABLE')));
    render();
    expect(await screen.findByText('No pudimos cargar tus reseñas. Intenta nuevamente.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('prompts anonymous visitors to sign in', () => {
    Object.assign(auth, { status: 'authenticated', currentUser: null });
    render();
    expect(screen.getByRole('heading', { name: 'Inicia sesión para ver tus reseñas' })).toBeInTheDocument();
  });
});
