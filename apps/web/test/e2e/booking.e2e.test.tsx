import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockDb, mockToken } from '../msw/handlers';
import { BOOKING_IDS, GUEST_ID, OWNER_ID, PROPERTY_IDS } from '../msw/fixtures';
import { locationRef, renderWithProviders } from '../utils';
import { session } from '../../src/api/session';
import { BookingProvider } from '../../src/context/BookingContext';
import { AppRoutes } from '../../src/app/routes';

/**
 * FE-039 — Sprint 3 E2E (RQ-07–RQ-11): book → pay → confirm → (cancel) → review over the full router
 * and the MSW contract mocks. The whole route tree is mounted (`AppRoutes`) so navigation, the role
 * guards (FE-024) and the data layer run end to end. Identity is mocked like the rest of the suite
 * (`AuthContext` + `session.accessToken`); the single source of test data is `test/msw`.
 *
 * State coherence between steps: the MSW mock keeps an in-memory DB that survives across renders within
 * a test (it is restored by `resetMockDb` only in the global `afterEach`), so a booking created in one
 * step is visible in the history of the next. Payments are the one gap: `payments-service` is INTERNAL
 * and not exposed on the Gateway, so the web client simulates the charge on the client (`api/payments`)
 * and never confirms the booking server-side. In production `bookings-service` confirms it from a
 * payment event; here `confirmBookingServerSide` stands in for that step by moving the booking to
 * CONFIRMED/CAPTURED in the mock DB. It wraps the existing state and never edits the shared handlers.
 *
 * External dependency (G1): the Gateway exposes none of `/bookings`, `/payments` or `/reviews` yet, so
 * everything here runs against MSW only. A real-environment pass (hitting the Gateway behind an
 * explicit env var, never with real card data) is intentionally NOT implemented while those routes do
 * not exist; it is documented here and must be added once G1 lands so `npm test` stays MSW-only.
 */

type User = { id: string; role: 'GUEST' | 'OWNER'; name: string };
const auth = vi.hoisted(() => ({ status: 'anonymous' as string, currentUser: null as User | null }));
vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ ...auth, logout: vi.fn(), retryProfile: vi.fn() }) }));

let token: string | undefined;
beforeEach(() => {
  Object.assign(auth, { status: 'anonymous', currentUser: null });
  token = undefined;
  vi.spyOn(session, 'accessToken').mockImplementation(() => token);
  try { localStorage.clear(); } catch { /* storage may be disabled */ }
  // Freeze the wall clock (Date only, so Testing Library/MSW timers stay real). Every stay date below
  // is fixed relative to this instant, so the suite never depends on the day it runs.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-10T12:00:00.000Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const asGuest = () => {
  Object.assign(auth, { status: 'authenticated', currentUser: { id: GUEST_ID, role: 'GUEST', name: 'Ana' } });
  token = mockToken('GUEST', GUEST_ID);
};
const asOwner = () => {
  Object.assign(auth, { status: 'authenticated', currentUser: { id: OWNER_ID, role: 'OWNER', name: 'Olga Ruiz' } });
  token = mockToken('OWNER', OWNER_ID);
};

const renderApp = (route: string) => renderWithProviders(<BookingProvider><AppRoutes /></BookingProvider>, { route });

/** The booking list row (`<li>`) that shows a given property name. */
const rowFor = (list: HTMLElement, name: string) => within(list).getByText(name).closest('li') as HTMLElement;

/**
 * Stands in for the server-side confirmation `bookings-service` performs after a successful payment
 * event. The web client never does this (payments are simulated client-side); the E2E applies it to
 * the shared in-memory DB so "my bookings" reflects a confirmed stay, as the real backend would.
 */
function confirmBookingServerSide(id: string) {
  const booking = mockDb.booking(id);
  if (!booking) throw new Error(`booking ${id} not found in mock db`);
  booking.status = 'CONFIRMED';
  booking.paymentStatus = 'CAPTURED';
}

/** Drives detail → book (valid dates) → the payment screen; returns the created booking id. */
async function reachPayment(propertyId: string, checkIn: string, checkOut: string) {
  const app = renderApp(`/property/${propertyId}`);
  fireEvent.click(await screen.findByRole('link', { name: 'Reservar' }));
  await screen.findByLabelText('ENTRADA');
  fireEvent.change(screen.getByLabelText('ENTRADA'), { target: { value: checkIn } });
  fireEvent.change(screen.getByLabelText('SALIDA'), { target: { value: checkOut } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));
  await waitFor(() => expect(locationRef.current?.pathname).toMatch(/\/booking\/.+\/pay/));
  const id = /\/booking\/([^/]+)\/pay/.exec(locationRef.current!.pathname)![1]!;
  await screen.findByRole('heading', { name: 'Pagar tu reserva' });
  return { app, id };
}

// ---------------------------------------------------------------------------
// Happy path: search context → detail → book → pay → confirmed in "my bookings"
// ---------------------------------------------------------------------------

describe('guest happy path (RQ-07)', () => {
  it('books a free property, sees the summary and total, pays, and the stay shows confirmed', async () => {
    asGuest();
    // Loft has no blocking bookings; the stay is deep in the future relative to the frozen clock.
    const app = renderApp(`/property/${PROPERTY_IDS.loft}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Loft Industrial Condesa' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Reservar' }));
    await screen.findByLabelText('ENTRADA');
    fireEvent.change(screen.getByLabelText('ENTRADA'), { target: { value: '2027-06-10' } });
    fireEvent.change(screen.getByLabelText('SALIDA'), { target: { value: '2027-06-13' } });

    // Summary and total (precio × noches, no extra fees) before confirming.
    const summary = screen.getByLabelText('Resumen de la reserva');
    expect(within(summary).getByText(/3 noches/)).toBeInTheDocument();
    expect(within(summary).getByText('Total')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));
    await waitFor(() => expect(locationRef.current?.pathname).toMatch(/\/booking\/.+\/pay/));
    const id = /\/booking\/([^/]+)\/pay/.exec(locationRef.current!.pathname)![1]!;

    // Payment screen shows the same reservation; a valid opaque token is approved.
    await screen.findByRole('heading', { name: 'Pagar tu reserva' });
    expect(screen.getByText('Loft Industrial Condesa')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Token de pago'), { target: { value: 'tok_valid_123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pagar' }));
    expect(await screen.findByText('¡Pago aprobado! Tu reserva está confirmada.')).toBeInTheDocument();

    // bookings-service confirms the stay from the payment event (simulated here), then open my bookings.
    confirmBookingServerSide(id);
    app.unmount();

    renderApp('/bookings');
    const list = await screen.findByRole('list', { name: 'Reservas' });
    const row = rowFor(list, 'Loft Industrial Condesa');
    expect(within(row).getByText('Confirmada')).toBeInTheDocument();
  });

  it('shows the decline message, and a retry neither duplicates the booking nor the charge', async () => {
    asGuest();
    const { id } = await reachPayment(PROPERTY_IDS.loft, '2027-07-10', '2027-07-13');

    // A token hinting a decline fails; the message is shown and a retry is offered.
    fireEvent.change(screen.getByLabelText('Token de pago'), { target: { value: 'declina_abcd1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pagar' }));
    expect(await screen.findByText('El pago fue rechazado. Revisa tu método de pago e inténtalo de nuevo.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    fireEvent.change(await screen.findByLabelText('Token de pago'), { target: { value: 'tok_valid_987654' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pagar' }));
    expect(await screen.findByText('¡Pago aprobado! Tu reserva está confirmada.')).toBeInTheDocument();

    // The failed-then-retried payment created exactly one booking (no duplicate charge/booking).
    expect(mockDb.bookings().filter((b) => b.propertyId === PROPERTY_IDS.loft)).toHaveLength(1);
    expect(mockDb.booking(id)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Availability (RQ-07): overlapping dates are rejected with a clear message
// ---------------------------------------------------------------------------

describe('availability conflict (RQ-07)', () => {
  it('rejects a second booking over already-occupied dates (409) without losing the input', async () => {
    asGuest();
    // Casa Azul's room is held by a CONFIRMED stay over [2026-12-10, 2026-12-14).
    renderApp(`/property/${PROPERTY_IDS.casaAzul}`);
    fireEvent.click(await screen.findByRole('link', { name: 'Reservar' }));
    await screen.findByLabelText('ENTRADA');
    fireEvent.change(screen.getByLabelText('ENTRADA'), { target: { value: '2026-12-11' } });
    fireEvent.change(screen.getByLabelText('SALIDA'), { target: { value: '2026-12-13' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));

    expect(await screen.findByText('Esas fechas ya no están disponibles. Elige otras.')).toBeInTheDocument();
    // The user stays on the form with what they typed.
    expect(locationRef.current?.pathname).toBe(`/property/${PROPERTY_IDS.casaAzul}/book`);
    expect(screen.getByLabelText('ENTRADA')).toHaveValue('2026-12-11');
    expect(screen.getByLabelText('SALIDA')).toHaveValue('2026-12-13');
  });
});

// ---------------------------------------------------------------------------
// Cancellation (RQ-09/RQ-10)
// ---------------------------------------------------------------------------

describe('cancellation (RQ-09/RQ-10)', () => {
  it('guest cancels from "my bookings", sees the policy and refund, and the stay is cancelled', async () => {
    asGuest();
    const app = renderApp('/bookings');
    const list = await screen.findByRole('list', { name: 'Reservas' });
    fireEvent.click(within(rowFor(list, 'Casa Azul Frente al Mar')).getByRole('link', { name: 'Cancelar reserva' }));

    await screen.findByRole('heading', { name: 'Cancelar reserva' });
    expect(screen.getByText(/Se aplicará la política de cancelación vigente/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelación' }));

    expect(await screen.findByText('Reserva cancelada.')).toBeInTheDocument();
    expect(screen.getByText('Cancelada por el huésped')).toBeInTheDocument();
    expect(screen.getByText('Reembolso en proceso.')).toBeInTheDocument(); // CAPTURED → REFUND_PENDING
    app.unmount();

    renderApp('/bookings');
    const list2 = await screen.findByRole('list', { name: 'Reservas' });
    expect(within(rowFor(list2, 'Casa Azul Frente al Mar')).getByText('Cancelada por el huésped')).toBeInTheDocument();
  });

  it('owner cannot confirm a cancellation without a justification, but can with one', async () => {
    asOwner();
    const app = renderApp('/host/bookings');
    const list = await screen.findByRole('list', { name: 'Reservas recibidas' });
    fireEvent.click(within(rowFor(list, 'Casa Azul Frente al Mar')).getByRole('link', { name: 'Cancelar reserva' }));

    await screen.findByRole('heading', { name: 'Cancelar reserva' });
    const confirm = screen.getByRole('button', { name: 'Confirmar cancelación' });
    expect(confirm).toBeDisabled(); // no justification yet

    fireEvent.change(screen.getByLabelText('Motivo de la cancelación'), { target: { value: 'Cierre por mantenimiento imprevisto.' } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    expect(await screen.findByText('Reserva cancelada.')).toBeInTheDocument();
    expect(screen.getByText('Cancelada por el anfitrión')).toBeInTheDocument();
    expect(screen.getByText('Reembolso en proceso.')).toBeInTheDocument();
    app.unmount();
  });
});

// ---------------------------------------------------------------------------
// Reviews (RQ-11, RQ-06): completed stay only; new review reflects everywhere
// ---------------------------------------------------------------------------

const NEW_REVIEW = 'Nuestra mejor estadía del año, repetiremos sin dudarlo.';

describe('rating a stay (RQ-11, RQ-06)', () => {
  it('rates a completed stay; the review shows in "my reviews" and in the property detail', async () => {
    asGuest();
    const app = renderApp('/bookings');
    const list = await screen.findByRole('list', { name: 'Reservas' });
    fireEvent.click(within(rowFor(list, 'Villa Serena Boutique Hotel & Spa')).getByRole('link', { name: 'Calificar alojamiento' }));

    await screen.findByRole('heading', { name: 'Calificar propiedad' });
    fireEvent.click(screen.getByRole('button', { name: '5 estrellas' }));
    fireEvent.change(screen.getByLabelText('Tu comentario'), { target: { value: NEW_REVIEW } });
    fireEvent.click(screen.getByRole('button', { name: 'Publicar reseña' }));
    expect(await screen.findByText('¡Gracias por tu reseña!')).toBeInTheDocument();
    app.unmount();

    // It appears in the guest's own reviews.
    const reviewsView = renderApp('/reviews');
    const myReviews = await screen.findByRole('list', { name: 'Mis reseñas' });
    expect(within(myReviews).getByText(NEW_REVIEW)).toBeInTheDocument();
    reviewsView.unmount();

    // And on the property detail, with the count and average updated (3 → 4 reviews).
    renderApp(`/property/${PROPERTY_IDS.villa}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Villa Serena Boutique Hotel & Spa' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Reseñas (4)' })).toBeInTheDocument();
    expect(screen.getByText('(4 reseñas)')).toBeInTheDocument();
    expect(screen.getByText(NEW_REVIEW)).toBeInTheDocument();
  });

  it('offers no rating action for a stay that is not completed', async () => {
    asGuest();
    const app = renderApp('/bookings');
    const list = await screen.findByRole('list', { name: 'Reservas' });
    // Casa Azul's stay is CONFIRMED (future), not COMPLETED: no rate link in the history.
    expect(within(rowFor(list, 'Casa Azul Frente al Mar')).queryByRole('link', { name: 'Calificar alojamiento' })).toBeNull();
    app.unmount();

    // Reaching the rating screen directly still refuses it.
    renderApp(`/bookings/${BOOKING_IDS.casaAzulConfirmed}/review`);
    expect(await screen.findByText('Solo puedes calificar una estadía completada.')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Security (RQ-07–RQ-11): guards and contract-enforced ownership
// ---------------------------------------------------------------------------

describe('security', () => {
  it('sends an anonymous visitor to login (keeping the destination) when booking/paying/cancelling/rating', async () => {
    const protectedPaths = [
      `/property/${PROPERTY_IDS.loft}/book`,
      `/booking/${BOOKING_IDS.casaAzulConfirmed}/pay`,
      `/bookings/${BOOKING_IDS.casaAzulConfirmed}/cancel`,
      `/bookings/${BOOKING_IDS.villaCompleted}/review`,
    ];
    for (const destination of protectedPaths) {
      const app = renderApp(destination);
      await waitFor(() => expect(locationRef.current?.pathname).toBe('/login'));
      expect((locationRef.current?.state as { from?: string } | null)?.from).toBe(destination);
      app.unmount();
    }
  });

  it('keeps a guest out of the owner area (/host/*)', async () => {
    asGuest();
    renderApp('/host/bookings');
    await waitFor(() => expect(locationRef.current?.pathname).toBe('/'));
    expect(screen.queryByRole('heading', { name: 'Reservas recibidas' })).not.toBeInTheDocument();
  });

  it('forbids an owner from reviewing their own property (contract 403)', async () => {
    asOwner();
    // The owner can load a booking they received, but the reviews contract only lets the stay's GUEST
    // post a review, so the server rejects it (403).
    renderApp(`/bookings/${BOOKING_IDS.villaCompleted}/review`);
    await screen.findByRole('heading', { name: 'Calificar propiedad' });
    fireEvent.click(screen.getByRole('button', { name: '5 estrellas' }));
    fireEvent.change(screen.getByLabelText('Tu comentario'), { target: { value: 'Mi propia propiedad.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publicar reseña' }));
    expect(await screen.findByText('Solo puedes reseñar una estadía completada que hayas realizado.')).toBeInTheDocument();
  });
});
