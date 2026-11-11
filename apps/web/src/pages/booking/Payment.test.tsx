import { fireEvent, screen, waitFor } from '@testing-library/react';
import { http as mock } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../test/msw/server';
import { mockDb, mockToken, problem } from '../../../test/msw/handlers';
import { BOOKING_IDS, GUEST_ID, OTHER_GUEST_ID, OWNER_ID, PROPERTY_IDS } from '../../../test/msw/fixtures';
import { locationRef, renderWithProviders } from '../../../test/utils';
import { createBooking } from '../../api/bookings';
import * as paymentsApi from '../../api/payments';
import { session } from '../../api/session';
import { BookingProvider } from '../../context/BookingContext';
import { RequireRole } from '../../app/RequireRole';
import { Payment } from './Payment';

/**
 * FE-031 (RQ-07) — payment screen, test-first. Mounted at `/booking/:bookingId/pay` behind a GUEST
 * guard. The booking (`GET /bookings/:id`) is the source of truth for the summary/total; the gateway
 * is simulated on the client (see api/payments.ts) since payments-service is internal (not on the
 * Gateway). Expected RED until FE-031 implements `./Payment`.
 */

type User = { id: string; role: 'GUEST' | 'OWNER'; name: string };
const auth = vi.hoisted(() => ({ status: 'authenticated' as string, currentUser: null as User | null }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ ...auth, logout: vi.fn(), retryProfile: vi.fn() }) }));

let token: string | undefined;
beforeEach(() => {
  Object.assign(auth, { status: 'authenticated', currentUser: { id: GUEST_ID, role: 'GUEST', name: 'Ana' } });
  token = mockToken('GUEST', GUEST_ID);
  vi.spyOn(session, 'accessToken').mockImplementation(() => token);
});
afterEach(() => vi.restoreAllMocks());

const payRoute = (bookingId: string) => `/booking/${bookingId}/pay`;
const renderPayment = (bookingId: string) =>
  renderWithProviders(<BookingProvider><Payment /></BookingProvider>, { route: payRoute(bookingId), path: '/booking/:bookingId/pay' });
const renderGuarded = (bookingId: string) =>
  renderWithProviders(
    <BookingProvider><RequireRole role="GUEST"><Payment /></RequireRole></BookingProvider>,
    { route: payRoute(bookingId), path: '/booking/:bookingId/pay' },
  );

/** Creates a fresh PENDING_PAYMENT booking owned by the current guest (3 nights × 145.00 = 435.00). */
async function createPending() {
  const room = mockDb.property(PROPERTY_IDS.casaAzul)!.rooms[0]!;
  return createBooking({ propertyId: PROPERTY_IDS.casaAzul, roomId: room.id, checkIn: '2027-05-05', checkOut: '2027-05-08', guests: 2 }, `idem-${crypto.randomUUID()}`);
}

describe('Payment — summary and charge', () => {
  it('shows the reservation summary and total before paying', async () => {
    const booking = await createPending();
    renderPayment(booking.id);
    expect(await screen.findByText(/Casa Azul Frente al Mar/)).toBeInTheDocument();
    expect(screen.getByText(/435/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pagar' })).toBeInTheDocument();
  });

  it('charges once on double click and shows success with a link to the bookings', async () => {
    const spy = vi.spyOn(paymentsApi, 'simulateCharge');
    const booking = await createPending();
    renderPayment(booking.id);
    await screen.findByRole('button', { name: 'Pagar' });
    fireEvent.change(screen.getByLabelText('Token de pago'), { target: { value: 'tok_valido_1234' } });
    const pay = screen.getByRole('button', { name: 'Pagar' });
    fireEvent.click(pay);
    fireEvent.click(pay); // double click must not charge twice
    expect(await screen.findByText(/aprobado/i)).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Ver mis reservas' })).toHaveAttribute('href', '/bookings');
  });

  it('shows a clear error and a retry on a declined payment', async () => {
    const booking = await createPending();
    renderPayment(booking.id);
    await screen.findByRole('button', { name: 'Pagar' });
    fireEvent.change(screen.getByLabelText('Token de pago'), { target: { value: `tok_${paymentsApi.SIMULATED_DECLINE_HINT}_1` } });
    fireEvent.click(screen.getByRole('button', { name: 'Pagar' }));
    expect(await screen.findByText(/rechaz/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(screen.getByRole('button', { name: 'Pagar' })).toBeInTheDocument(); // back to the form, no duplicate charge
  });

  it('shows the confirmed state when the booking is already paid', async () => {
    renderPayment(BOOKING_IDS.casaAzulConfirmed); // seeded CONFIRMED booking owned by the guest
    expect(await screen.findByText(/confirmada/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pagar' })).not.toBeInTheDocument();
  });

  it('resumes on reload without creating another payment', async () => {
    const booking = await createPending();
    const first = renderPayment(booking.id);
    expect(await screen.findByText(/435/)).toBeInTheDocument();
    first.unmount();
    renderPayment(booking.id);
    expect(await screen.findByText(/435/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pagar' })).toBeInTheDocument();
  });
});

describe('Payment — errors and access', () => {
  it('shows a not-found message for a booking of another guest', async () => {
    token = mockToken('GUEST', OTHER_GUEST_ID);
    renderPayment(BOOKING_IDS.casaAzulConfirmed);
    expect(await screen.findByText(/No encontramos tu reserva/i)).toBeInTheDocument();
  });

  it('redirects to login on 401, keeping the destination', async () => {
    token = undefined;
    renderPayment(BOOKING_IDS.casaAzulConfirmed);
    await waitFor(() => expect(locationRef.current?.pathname).toBe('/login'));
    expect(locationRef.current?.state).toMatchObject({ from: payRoute(BOOKING_IDS.casaAzulConfirmed) });
  });

  it('shows a retryable error on a server failure without losing the context', async () => {
    server.use(mock.get('*/api/v1/bookings/:bookingId', () => problem(503, 'UNAVAILABLE'), { once: true }));
    renderPayment(BOOKING_IDS.casaAzulConfirmed);
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('sends an anonymous visitor to login', async () => {
    Object.assign(auth, { status: 'authenticated', currentUser: null });
    renderGuarded(BOOKING_IDS.casaAzulConfirmed);
    await waitFor(() => expect(locationRef.current?.pathname).toBe('/login'));
    expect(screen.queryByRole('button', { name: 'Pagar' })).not.toBeInTheDocument();
  });

  it('redirects a property owner away from the payment screen', async () => {
    Object.assign(auth, { status: 'authenticated', currentUser: { id: OWNER_ID, role: 'OWNER', name: 'Olga' } });
    renderGuarded(BOOKING_IDS.casaAzulConfirmed);
    await waitFor(() => expect(locationRef.current?.pathname).toBe('/'));
  });
});
