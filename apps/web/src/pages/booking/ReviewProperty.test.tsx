import { fireEvent, screen, waitFor } from '@testing-library/react';
import { http as mock } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../test/msw/server';
import { mockToken, problem } from '../../../test/msw/handlers';
import { BOOKING_IDS, GUEST_ID } from '../../../test/msw/fixtures';
import { locationRef, renderWithProviders } from '../../../test/utils';
import { session } from '../../api/session';
import { ReviewProperty } from './ReviewProperty';

/**
 * FE-037 (RQ-11) — "rate property" screen, test-first. Mounted at `/bookings/:bookingId/review`.
 * Enabled only after a COMPLETED stay (the booking is the source of truth); writes via `POST /reviews`
 * (MSW). Clock frozen for the completed-stay rule.
 */

type User = { id: string; role: 'GUEST' | 'OWNER'; name: string };
const auth = vi.hoisted(() => ({ status: 'authenticated' as string, currentUser: null as User | null }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ ...auth, logout: vi.fn(), retryProfile: vi.fn() }) }));

let token: string | undefined;
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-11-10T12:00:00.000Z'));
  Object.assign(auth, { status: 'authenticated', currentUser: { id: GUEST_ID, role: 'GUEST', name: 'Ana' } });
  token = mockToken('GUEST', GUEST_ID);
  vi.spyOn(session, 'accessToken').mockImplementation(() => token);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const reviewRoute = (id: string) => `/bookings/${id}/review`;
const renderReview = (id: string) =>
  renderWithProviders(<ReviewProperty />, { route: reviewRoute(id), path: '/bookings/:bookingId/review' });

describe('ReviewProperty', () => {
  it('lets the guest rate a completed stay once and shows success', async () => {
    let posts = 0;
    server.events.on('request:start', ({ request }) => { if (request.method === 'POST' && request.url.includes('/reviews')) posts += 1; });
    renderReview(BOOKING_IDS.villaCompleted); // COMPLETED
    expect(await screen.findByText('Villa Serena Boutique Hotel & Spa')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '5 estrellas' }));
    fireEvent.change(screen.getByLabelText('Tu comentario'), { target: { value: 'Una estadía inolvidable.' } });
    const publish = screen.getByRole('button', { name: 'Publicar reseña' });
    fireEvent.click(publish);
    fireEvent.click(publish); // double click must not post twice
    expect(await screen.findByText(/Gracias por tu reseña/i)).toBeInTheDocument();
    server.events.removeAllListeners();
    expect(posts).toBe(1);
  });

  it('does not allow rating a stay that is not completed', async () => {
    renderReview(BOOKING_IDS.casaAzulConfirmed); // CONFIRMED
    expect(await screen.findByText(/Solo puedes calificar una estadía completada/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publicar reseña' })).not.toBeInTheDocument();
  });

  it('validates the rating and comment before submitting', async () => {
    let posts = 0;
    server.events.on('request:start', ({ request }) => { if (request.method === 'POST' && request.url.includes('/reviews')) posts += 1; });
    renderReview(BOOKING_IDS.villaCompleted);
    await screen.findByRole('button', { name: 'Publicar reseña' });
    fireEvent.click(screen.getByRole('button', { name: 'Publicar reseña' }));
    expect(await screen.findByText('Elige una calificación y escribe un comentario.')).toBeInTheDocument();
    server.events.removeAllListeners();
    expect(posts).toBe(0);
  });

  it('shows a conflict when the stay was already reviewed (409)', async () => {
    server.use(mock.post('*/api/v1/reviews', () => problem(409, 'REVIEW_ALREADY_EXISTS')));
    renderReview(BOOKING_IDS.villaCompleted);
    await screen.findByRole('button', { name: 'Publicar reseña' });
    fireEvent.click(screen.getByRole('button', { name: '4 estrellas' }));
    fireEvent.change(screen.getByLabelText('Tu comentario'), { target: { value: 'Repetida.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publicar reseña' }));
    expect(await screen.findByText('Ya dejaste una reseña para esta reserva.')).toBeInTheDocument();
  });

  it('keeps the comment on a server failure (5xx)', async () => {
    server.use(mock.post('*/api/v1/reviews', () => problem(503, 'UNAVAILABLE')));
    renderReview(BOOKING_IDS.villaCompleted);
    await screen.findByRole('button', { name: 'Publicar reseña' });
    fireEvent.click(screen.getByRole('button', { name: '5 estrellas' }));
    fireEvent.change(screen.getByLabelText('Tu comentario'), { target: { value: 'Comentario importante.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publicar reseña' }));
    expect(await screen.findByText('No pudimos publicar tu reseña. Intenta nuevamente.')).toBeInTheDocument();
    expect(screen.getByLabelText('Tu comentario')).toHaveValue('Comentario importante.');
  });

  it('redirects to login on 401, keeping the destination', async () => {
    token = undefined;
    renderReview(BOOKING_IDS.villaCompleted);
    await waitFor(() => expect(locationRef.current?.pathname).toBe('/login'));
    expect(locationRef.current?.state).toMatchObject({ from: reviewRoute(BOOKING_IDS.villaCompleted) });
  });
});
