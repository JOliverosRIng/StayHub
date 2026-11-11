import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http as mock } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../test/msw/server';
import { mockDb, mockToken, problem } from '../../../test/msw/handlers';
import { GUEST_ID, OWNER_ID, PROPERTY_IDS } from '../../../test/msw/fixtures';
import { locationRef, renderWithProviders } from '../../../test/utils';
import { session } from '../../api/session';
import { BookingProvider } from '../../context/BookingContext';
import { RequireRole } from '../../app/RequireRole';
import { Booking } from './Booking';

/**
 * FE-028 (RQ-07) — booking flow, test-first. Drives the page FE-030 will build in
 * `apps/web/src/pages/booking/Booking.tsx`, mounted at `/property/:id/book` behind a GUEST guard.
 *
 * Contract-aligned rules (`specs/003-reservas-pagos-resenas/booking_service/spec.md`): the total is
 * `precio × noches` with NO extra fees (§48/§138); confirming creates the booking in PENDING_PAYMENT
 * via `POST /bookings` and navigates to the payment step `/booking/:bookingId/pay` (FE-031);
 * availability is authoritative on the server (409 BOOKING_CONFLICT). Runs against MSW.
 *
 * Expected RED until FE-030 implements `./Booking` and wires its route.
 */

type User = { id: string; role: 'GUEST' | 'OWNER'; name: string };
const auth = vi.hoisted(() => ({ status: 'authenticated' as string, currentUser: null as User | null }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ ...auth, logout: vi.fn(), retryProfile: vi.fn() }) }));

let token: string | undefined;
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-11-10T12:00:00.000Z')); // deterministic "today"
  Object.assign(auth, { status: 'authenticated', currentUser: { id: GUEST_ID, role: 'GUEST', name: 'Ana' } });
  token = mockToken('GUEST', GUEST_ID);
  vi.spyOn(session, 'accessToken').mockImplementation(() => token);
  try { localStorage.clear(); } catch { /* storage may be disabled */ }
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const bookRoute = (id: string) => `/property/${id}/book`;
const renderBooking = (id: string = PROPERTY_IDS.casaAzul) =>
  renderWithProviders(<BookingProvider><Booking /></BookingProvider>, { route: bookRoute(id), path: '/property/:id/book' });
const renderGuarded = (id: string = PROPERTY_IDS.casaAzul) =>
  renderWithProviders(
    <BookingProvider><RequireRole role="GUEST"><Booking /></RequireRole></BookingProvider>,
    { route: bookRoute(id), path: '/property/:id/book' },
  );

const fill = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('Booking flow — dates and total', () => {
  it('shows a summary with property, nights, guests and the fee-free total', async () => {
    renderBooking();
    await screen.findByRole('heading', { name: /Casa Azul Frente al Mar/ });
    fill('ENTRADA', '2027-01-05');
    fill('SALIDA', '2027-01-08');
    // 3 nights × 145.00 USD = 435.00, with no service fee (contract).
    expect(screen.getByText(/3 noche/)).toBeInTheDocument();
    expect(screen.getByText(/435/)).toBeInTheDocument();
    expect(screen.queryByText(/servicio/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('HUÉSPEDES')).toHaveValue('1');
  });

  it('validates required dates and a valid range before any request', async () => {
    const listener = vi.fn();
    server.events.on('request:start', listener);
    renderBooking();
    await screen.findByRole('heading', { name: /Casa Azul/ });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));
    expect(await screen.findByText('Selecciona la fecha de entrada')).toBeInTheDocument();
    fill('ENTRADA', '2027-01-10');
    fill('SALIDA', '2027-01-08');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));
    expect(screen.getByText('La fecha de salida debe ser posterior a la de entrada')).toBeInTheDocument();
    server.events.removeAllListeners();
    expect(listener).not.toHaveBeenCalled();
  });

  it('rejects dates in the past', async () => {
    renderBooking();
    await screen.findByRole('heading', { name: /Casa Azul/ });
    fill('ENTRADA', '2026-11-01'); // before the frozen "today" (2026-11-10)
    fill('SALIDA', '2027-01-08');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));
    expect(screen.getByText('La fecha de entrada no puede ser en el pasado')).toBeInTheDocument();
  });

  it('caps guests at the room capacity', async () => {
    renderBooking(PROPERTY_IDS.villa); // room 1 "Suite Mediterránea" has capacity 2
    await screen.findByRole('heading', { name: /Villa Serena/ });
    const guests = screen.getByLabelText('HUÉSPEDES');
    expect(within(guests).getAllByRole('option')).toHaveLength(2);
    expect(within(guests).queryByRole('option', { name: /^3\b/ })).not.toBeInTheDocument();
  });

  it('updates the total when the room changes', async () => {
    renderBooking(PROPERTY_IDS.villa);
    await screen.findByRole('heading', { name: /Villa Serena/ });
    fill('ENTRADA', '2027-02-01');
    fill('SALIDA', '2027-02-04'); // 3 nights
    expect(screen.getByText(/585/)).toBeInTheDocument(); // 195 × 3 (room 1)
    fireEvent.change(screen.getByLabelText('HABITACIÓN'), { target: { value: mockDb.property(PROPERTY_IDS.villa)!.rooms[1]!.id } });
    expect(screen.getByText(/780/)).toBeInTheDocument(); // 260 × 3 (room 2)
  });
});

describe('Booking flow — confirmation', () => {
  it('creates the booking once and navigates to payment', async () => {
    let posts = 0;
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && request.url.includes('/bookings')) posts += 1;
    });
    renderBooking();
    await screen.findByRole('heading', { name: /Casa Azul Frente al Mar/ });
    fill('ENTRADA', '2027-01-05');
    fill('SALIDA', '2027-01-08');
    const confirm = screen.getByRole('button', { name: 'Confirmar reserva' });
    fireEvent.click(confirm);
    fireEvent.click(confirm); // double click must not create a second booking
    await waitFor(() => expect(locationRef.current?.pathname).toMatch(/^\/booking\/[0-9a-f-]+\/pay$/));
    server.events.removeAllListeners();
    const created = mockDb.bookings().find((b) => b.status === 'PENDING_PAYMENT')!;
    expect(created).toBeDefined();
    expect(locationRef.current?.pathname).toBe(`/booking/${created.id}/pay`);
    expect(posts).toBe(1);
  });

  it('rejects overlapping dates (409) and keeps the entered values', async () => {
    renderBooking(); // Casa Azul room 1 is booked [2026-12-10, 2026-12-14)
    await screen.findByRole('heading', { name: /Casa Azul/ });
    fill('ENTRADA', '2026-12-12');
    fill('SALIDA', '2026-12-16');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));
    expect(await screen.findByText('Esas fechas ya no están disponibles. Elige otras.')).toBeInTheDocument();
    expect(locationRef.current?.pathname).toBe(bookRoute(PROPERTY_IDS.casaAzul));
    expect(screen.getByLabelText('ENTRADA')).toHaveValue('2026-12-12');
  });

  it('shows server field errors (400) without losing input', async () => {
    server.use(mock.post('*/api/v1/bookings', () => problem(400, 'VALIDATION_ERROR', [{ field: 'guests', code: 'INVALID_VALUE' }])));
    renderBooking();
    await screen.findByRole('heading', { name: /Casa Azul/ });
    fill('ENTRADA', '2027-01-05');
    fill('SALIDA', '2027-01-08');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));
    expect(await screen.findByText('Revisa las fechas y el número de huéspedes.')).toBeInTheDocument();
    expect(screen.getByLabelText('ENTRADA')).toHaveValue('2027-01-05');
  });

  it('shows a retryable error on a server failure (5xx) without losing input', async () => {
    server.use(mock.post('*/api/v1/bookings', () => problem(503, 'UNAVAILABLE'), { once: true }));
    renderBooking();
    await screen.findByRole('heading', { name: /Casa Azul/ });
    fill('ENTRADA', '2027-04-01');
    fill('SALIDA', '2027-04-03');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));
    expect(await screen.findByText('No pudimos completar la reserva. Intenta nuevamente.')).toBeInTheDocument();
    expect(screen.getByLabelText('ENTRADA')).toHaveValue('2027-04-01');
  });

  it('redirects to login on 401, keeping the destination', async () => {
    token = undefined; // guest in context, but the request carries no bearer → server 401
    renderBooking();
    await screen.findByRole('heading', { name: /Casa Azul/ });
    fill('ENTRADA', '2027-03-01');
    fill('SALIDA', '2027-03-04');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));
    await waitFor(() => expect(locationRef.current?.pathname).toBe('/login'));
    expect(locationRef.current?.state).toMatchObject({ from: bookRoute(PROPERTY_IDS.casaAzul) });
  });
});

describe('Booking flow — access (authenticated guest only)', () => {
  it('sends an anonymous visitor to login', async () => {
    Object.assign(auth, { status: 'authenticated', currentUser: null });
    renderGuarded();
    await waitFor(() => expect(locationRef.current?.pathname).toBe('/login'));
    expect(screen.queryByRole('button', { name: 'Confirmar reserva' })).not.toBeInTheDocument();
  });

  it('redirects a property owner away from the booking flow', async () => {
    Object.assign(auth, { status: 'authenticated', currentUser: { id: OWNER_ID, role: 'OWNER', name: 'Olga' } });
    renderGuarded();
    await waitFor(() => expect(locationRef.current?.pathname).toBe('/'));
  });

  it('lets an authenticated guest reach the form', async () => {
    renderGuarded();
    expect(await screen.findByRole('button', { name: 'Confirmar reserva' })).toBeInTheDocument();
  });
});
