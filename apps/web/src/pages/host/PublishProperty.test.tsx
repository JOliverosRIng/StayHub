import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http as mock } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../test/msw/server';
import { mockDb, mockToken, problem } from '../../../test/msw/handlers';
import { OWNER_ID } from '../../../test/msw/fixtures';
import { renderWithProviders } from '../../../test/utils';
import { session } from '../../api/session';
import { PublishProperty } from './PublishProperty';

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ status: 'authenticated', currentUser: { id: OWNER_ID, role: 'OWNER', name: 'Olga' }, logout: vi.fn(), retryProfile: vi.fn() }),
}));

beforeEach(() => { vi.spyOn(session, 'accessToken').mockReturnValue(mockToken('OWNER', OWNER_ID)); });
afterEach(() => vi.restoreAllMocks());

const fill = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const image = (name = 'portada.jpg', bytes = 2048, type = 'image/jpeg') => new File([new Uint8Array(bytes)], name, { type });
const addPhotos = (...files: File[]) => fireEvent.change(screen.getByLabelText('Agregar fotos'), { target: { files } });

function renderForm() {
  return renderWithProviders(<PublishProperty />, { route: '/host/new', path: '/host/new' });
}

function fillValidForm() {
  fill('Tipo de alojamiento', 'HOUSE');
  fill('Nombre', 'Casa del Lago');
  fill('Descripción', 'Frente al lago, con muelle privado.');
  fill('Dirección', 'Ruta 40 km 3');
  fill('Ciudad', 'Villa La Angostura');
  fill('Región o estado', 'Neuquén');
  fill(/País/, 'ar');
  fill('Latitud (opcional)', '-40.76');
  fill('Longitud (opcional)', '-71.64');
  fireEvent.click(screen.getByLabelText('Wi-Fi'));
  fireEvent.click(screen.getByLabelText('Estacionamiento'));
  fill('Nombre de la habitación', 'Cabaña completa');
  fill('Capacidad', '4');
  fill('Precio por noche', '150.50');
}

const newest = () => mockDb.properties().find((p) => p.name === 'Casa del Lago');

describe('PublishProperty form', () => {
  it('validates required fields before sending anything', async () => {
    const listener = vi.fn();
    server.events.on('request:start', listener);
    renderForm();
    fill('Capacidad', '0');
    fireEvent.click(screen.getByRole('button', { name: 'Publicar propiedad' }));
    expect(screen.getByText('Revisa los campos marcados antes de continuar.')).toBeInTheDocument();
    for (const message of [
      'Selecciona el tipo de alojamiento.', 'El nombre es obligatorio.', 'La dirección es obligatoria.', 'La ciudad es obligatoria.',
      'La región o estado es obligatorio.', 'Usa el código de país de 2 letras (p. ej. CO, MX, ES).',
      'El nombre de la habitación es obligatorio.', 'Capacidad mínima de 1 huésped.', 'Indica el precio por noche.',
      'Agrega al menos una foto para publicar.',
    ]) expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'true');
    await new Promise((r) => setTimeout(r, 20));
    expect(listener).not.toHaveBeenCalled();
    server.events.removeAllListeners();
  });

  it('validates price format, coordinates and country code', () => {
    renderForm();
    fillValidForm();
    fill('Precio por noche', '0.00');
    fill('Latitud (opcional)', '95');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar como borrador' }));
    expect(screen.getByText('Precio mayor que 0, con hasta 2 decimales.')).toBeInTheDocument();
    expect(screen.getByText('Latitud entre -90 y 90.')).toBeInTheDocument();
    expect(screen.getByLabelText(/País/)).toHaveValue('AR');
  });

  it('adds and removes rooms dynamically, always keeping one', () => {
    renderForm();
    expect(screen.queryByRole('button', { name: /Eliminar habitación/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ Agregar habitación' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Agregar habitación' }));
    expect(screen.getAllByLabelText('Nombre de la habitación')).toHaveLength(3);
    fireEvent.change(screen.getAllByLabelText('Nombre de la habitación')[1]!, { target: { value: 'Segunda' } });
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar habitación 1' }));
    const names = screen.getAllByLabelText('Nombre de la habitación');
    expect(names).toHaveLength(2);
    expect(names[0]).toHaveValue('Segunda');
  });

  it('validates selected photos by type, size and count', () => {
    renderForm();
    addPhotos(image('anim.gif', 10, 'image/gif'), image('enorme.jpg', 5_000_001), image('ok.webp', 10, 'image/webp'));
    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: 'Publicar propiedad' }));
    const list = screen.getByRole('list', { name: 'Fotos seleccionadas' });
    expect(within(list).getByText('Solo se aceptan fotos JPEG, PNG o WebP.')).toBeInTheDocument();
    expect(within(list).getByText('La foto supera 5 MB (5 000 000 bytes).')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar anim.gif' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quitar enorme.jpg' }));
    addPhotos(...Array.from({ length: 10 }, (_, i) => image(`f${i}.jpg`)));
    fireEvent.click(screen.getByRole('button', { name: 'Publicar propiedad' }));
    expect(screen.getByText('Puedes subir hasta 10 fotos.')).toBeInTheDocument();
  });

  it('creates, uploads photos in order and publishes, then opens the listing', async () => {
    renderForm();
    fillValidForm();
    addPhotos(image('portada.jpg'), image('sala.png', 4096, 'image/png'));
    fireEvent.click(screen.getByRole('button', { name: 'Publicar propiedad' }));
    await waitFor(() => expect(screen.getByTestId('route')).toHaveTextContent(`/property/${newest()!.id}`));
    expect(newest()).toMatchObject({
      status: 'PUBLISHED', type: 'HOUSE', ownerId: OWNER_ID, description: 'Frente al lago, con muelle privado.',
      location: { country: 'AR', latitude: -40.76, longitude: -71.64 },
      rooms: [expect.objectContaining({ name: 'Cabaña completa', capacity: 4, basePrice: { amount: '150.50', currency: 'USD' } })],
    });
    expect(newest()!.features.map((f) => f.code)).toEqual(['WIFI', 'PARKING']);
    expect(newest()!.photos.map((p) => [p.position, p.mediaType])).toEqual([[0, 'image/jpeg'], [1, 'image/png']]);
  });

  it('saves a draft without photos', async () => {
    renderForm();
    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar como borrador' }));
    await waitFor(() => expect(newest()).toMatchObject({ status: 'DRAFT', photos: [] }));
    await waitFor(() => expect(screen.getByTestId('route')).toHaveTextContent(`/property/${newest()!.id}`));
  });

  it('marks fields rejected by the server', async () => {
    server.use(mock.post('*/api/v1/properties', () => problem(400, 'VALIDATION_ERROR', [{ field: 'location.city', code: 'INVALID_VALUE' }, { field: 'rooms[0]', code: 'INVALID_VALUE' }])));
    renderForm();
    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar como borrador' }));
    expect(await screen.findByText('Revisa los datos marcados en el formulario.')).toBeInTheDocument();
    expect(screen.getByLabelText('Ciudad')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Guardar como borrador' })).toBeEnabled();
  });

  it('resumes after a failed photo upload without creating a duplicate', async () => {
    server.use(mock.post('*/api/v1/properties/:id/photos', () => problem(503, 'UNAVAILABLE'), { once: true }));
    const before = mockDb.properties().length;
    renderForm();
    fillValidForm();
    addPhotos(image('portada.jpg'), image('sala.jpg'));
    fireEvent.click(screen.getByRole('button', { name: 'Publicar propiedad' }));
    expect(await screen.findByText(/una foto no se pudo subir/)).toBeInTheDocument();
    expect(screen.getByText('El servicio no está disponible. Intenta nuevamente.')).toBeInTheDocument();
    expect(newest()).toMatchObject({ status: 'DRAFT' });
    expect(newest()!.photos).toHaveLength(1);
    expect(screen.getByLabelText('Nombre')).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Publicar propiedad' }));
    await waitFor(() => expect(screen.getByTestId('route')).toHaveTextContent(`/property/${newest()!.id}`));
    expect(mockDb.properties()).toHaveLength(before + 1);
    expect(newest()).toMatchObject({ status: 'PUBLISHED' });
    expect(newest()!.photos).toHaveLength(2);
  });

  it('explains when the owner session lacks permission', async () => {
    vi.mocked(session.accessToken).mockReturnValue(mockToken('GUEST', 'x'));
    renderForm();
    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar como borrador' }));
    expect(await screen.findByText('Solo los propietarios pueden publicar alojamientos.')).toBeInTheDocument();
  });
});
