import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http as mock } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../test/msw/server';
import { mockDb, mockToken, problem } from '../../test/msw/handlers';
import { GUEST_ID, OWNER_ID, PROPERTY_IDS } from '../../test/msw/fixtures';
import { renderWithProviders } from '../../test/utils';
import { session } from '../api/session';
import { BookingProvider } from '../context/BookingContext';
import type { PendingBookingData } from '../types';
import { PropertyDetail } from './PropertyDetail';

const auth = vi.hoisted(() => ({ status: 'anonymous', currentUser: null as null | { id: string; role: string; name: string } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ ...auth, logout: vi.fn(), retryProfile: vi.fn() }) }));

beforeEach(() => { auth.currentUser = null; localStorage.removeItem('stayhub_bookings'); });
afterEach(() => vi.restoreAllMocks());

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().split('T')[0]!;

function renderDetail(propertyId: string, props: Partial<{ pendingBooking: PendingBookingData; onBookingRequired: () => void; onBookingConfirmed: () => void }> = {}) {
  const onBookingRequired = props.onBookingRequired ?? vi.fn();
  const onBookingConfirmed = props.onBookingConfirmed ?? vi.fn();
  renderWithProviders(
    <BookingProvider>
      <PropertyDetail propertyId={propertyId} pendingBooking={props.pendingBooking} onBookingRequired={onBookingRequired} onBookingConfirmed={onBookingConfirmed} />
    </BookingProvider>,
    { route: `/property/${propertyId}`, path: '/property/:id' },
  );
  return { onBookingRequired, onBookingConfirmed };
}

describe('PropertyDetail', () => {
  it('shows a loading state and then the full listing', async () => {
    renderDetail(PROPERTY_IDS.villa);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando alojamiento…');
    expect(await screen.findByRole('heading', { level: 1, name: 'Villa Serena Boutique Hotel & Spa' })).toBeInTheDocument();
    expect(screen.getByText(/piscina infinity frente al Mediterráneo/)).toBeInTheDocument();
    const rooms = screen.getByRole('region', { name: 'Habitaciones y precios' });
    expect(within(rooms).getByText('Suite Mediterránea')).toBeInTheDocument();
    expect(within(rooms).getByText(/195/)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Lo que ofrece este lugar' })).getByText('Piscina')).toBeInTheDocument();
    expect(screen.getByText(/desde .*195.* \/ noche/)).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: /Villa Serena Boutique Hotel & Spa, foto \d de 4/ })).toHaveLength(4);
    expect(screen.getByTitle('Mapa de ubicación de Villa Serena Boutique Hotel & Spa')).toHaveAttribute('src', expect.stringContaining('marker=39.5696,2.6502'));
    const reviews = screen.getByRole('region', { name: /Reseñas/ });
    expect(await within(reviews).findByText('Volveremos sin duda.')).toBeInTheDocument();
    expect(within(reviews).getByText('4.67')).toBeInTheDocument();
    expect(screen.getByText('(3 reseñas)')).toBeInTheDocument();
  });

  it('shows a not-found page for missing properties', async () => {
    renderDetail('00000000-0000-4000-8000-000000000000');
    expect(await screen.findByRole('heading', { name: 'No encontramos este alojamiento' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Buscar alojamientos' }));
    expect(screen.getByTestId('route')).toHaveTextContent('/search');
  });

  it('hides drafts from visitors', async () => {
    renderDetail(PROPERTY_IDS.draft);
    expect(await screen.findByRole('heading', { name: 'No encontramos este alojamiento' })).toBeInTheDocument();
  });

  it('lets the owner preview a draft', async () => {
    vi.spyOn(session, 'accessToken').mockReturnValue(mockToken('OWNER', OWNER_ID));
    renderDetail(PROPERTY_IDS.draft);
    expect(await screen.findByText('Borrador: solo tú puedes ver esta propiedad.')).toBeInTheDocument();
    expect(screen.getByText('Este alojamiento aún no tiene fotos.')).toBeInTheDocument();
    expect(screen.getByText(/todavía no tiene habitaciones con precio/)).toBeInTheDocument();
  });

  it('shows a retryable error when the service fails', async () => {
    server.use(mock.get('*/api/v1/properties/:id', () => problem(503, 'UNAVAILABLE'), { once: true }));
    renderDetail(PROPERTY_IDS.villa);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar el alojamiento. Intenta nuevamente.');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Villa Serena Boutique Hotel & Spa' })).toBeInTheDocument();
  });

  it('opens an accessible gallery operable with the keyboard', async () => {
    renderDetail(PROPERTY_IDS.villa);
    const trigger = await screen.findByRole('button', { name: 'Ver foto 2 de 4 en tamaño completo' });
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Galería de fotos de Villa Serena Boutique Hotel & Spa' });
    expect(within(dialog).getByText('Foto 2 de 4')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cerrar galería' })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    expect(within(dialog).getByText('Foto 3 de 4')).toBeInTheDocument();
    expect(within(dialog).getByRole('img')).toHaveAttribute('alt', 'Villa Serena Boutique Hotel & Spa, foto 3 de 4');
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' }); fireEvent.keyDown(dialog, { key: 'ArrowLeft' }); fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
    expect(within(dialog).getByText('Foto 4 de 4')).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('loads more reviews on demand', async () => {
    for (let i = 0; i < 4; i += 1) {
      mockDb.addReview({ id: `5f3b0e96-4d9a-4a99-9e4c-00000000000${i}`, propertyId: PROPERTY_IDS.villa, authorId: GUEST_ID, authorName: `Extra ${i}`, rating: 3, comment: `Comentario extra ${i}`, createdAt: '2026-08-01T00:00:00.000Z' });
    }
    renderDetail(PROPERTY_IDS.villa);
    const reviews = await screen.findByRole('region', { name: /Reseñas \(7\)/ });
    expect(within(reviews).getAllByRole('listitem')).toHaveLength(5);
    fireEvent.click(within(reviews).getByRole('button', { name: 'Mostrar más reseñas' }));
    await waitFor(() => expect(within(reviews).getAllByRole('listitem')).toHaveLength(7));
  });

  it('shows the address when no coordinates are available and handles properties without reviews', async () => {
    renderDetail(PROPERTY_IDS.loft);
    expect(await screen.findByText('El anfitrión aún no indicó la ubicación exacta en el mapa.')).toBeInTheDocument();
    expect(screen.getByText('Av. Ámsterdam 210, Ciudad de México, CDMX, MX')).toBeInTheDocument();
    expect(await screen.findByText('Este alojamiento aún no tiene reseñas.')).toBeInTheDocument();
  });

  it('asks anonymous visitors to sign in with the selected room, dates and real price', async () => {
    const { onBookingRequired } = renderDetail(PROPERTY_IDS.villa);
    await screen.findByRole('heading', { level: 1 });
    fireEvent.change(screen.getByLabelText('HABITACIÓN'), { target: { value: mockDb.property(PROPERTY_IDS.villa)!.rooms[1]!.id } });
    fireEvent.change(screen.getByLabelText('ENTRADA'), { target: { value: day(10) } });
    fireEvent.change(screen.getByLabelText('SALIDA'), { target: { value: day(12) } });
    fireEvent.click(screen.getByRole('button', { name: /Inicia sesión para reservar/ }));
    expect(onBookingRequired).toHaveBeenCalledWith(expect.objectContaining({
      roomId: mockDb.property(PROPERTY_IDS.villa)!.rooms[1]!.id, nights: 2, pricePerNight: 260, accommodationFee: 520, serviceFee: 52, totalPrice: 572,
    }));
  });

  it('validates booking dates', async () => {
    renderDetail(PROPERTY_IDS.villa);
    await screen.findByRole('heading', { level: 1 });
    fireEvent.click(screen.getByRole('button', { name: /reservar/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Selecciona la fecha de entrada');
  });

  it('restores a pending booking after login and confirms it', async () => {
    auth.currentUser = { id: GUEST_ID, role: 'GUEST', name: 'Ana' };
    const roomId = mockDb.property(PROPERTY_IDS.casaAzul)!.rooms[0]!.id;
    const pendingBooking: PendingBookingData = { roomId, checkIn: day(20), checkOut: day(23), guests: 2, nights: 3, pricePerNight: 145, accommodationFee: 435, cleaningFee: 0, serviceFee: 43.5, totalPrice: 478.5 };
    const { onBookingConfirmed } = renderDetail(PROPERTY_IDS.casaAzul, { pendingBooking });
    expect(await screen.findByRole('heading', { name: 'Confirma tu reserva' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));
    expect(onBookingConfirmed).toHaveBeenCalled();
    expect(screen.getByText('¡Reserva confirmada!')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('stayhub_bookings')!)).toEqual([expect.objectContaining({ roomId, userId: GUEST_ID, totalPrice: 478.5 })]);
  });
});
