import { fireEvent, screen, waitFor } from '@testing-library/react';
import { http as mock } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../msw/server';
import { mockDb, mockToken, problem } from '../msw/handlers';
import { GUEST_ID, OWNER_ID, PROPERTY_IDS } from '../msw/fixtures';
import { locationRef, renderWithProviders } from '../utils';
import { session } from '../../src/api/session';
import { BookingProvider } from '../../src/context/BookingContext';
import { AppRoutes } from '../../src/app/routes';

/**
 * FE-025 — Sprint 2 E2E (RQ-03–RQ-06): search → detail → publish/edit over the full router and MSW.
 *
 * The whole route tree is mounted (`AppRoutes`) so navigation, the role guards (FE-024) and the data
 * layer run end to end against the contract mocks. Identity is mocked like the rest of the suite
 * (`AuthContext` + `session.accessToken`), the single source of test data is `test/msw`. Everything is
 * MSW-only; when the Gateway exposes these routes the same journeys run against the real environment.
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
});
afterEach(() => vi.restoreAllMocks());

const asOwner = () => {
  Object.assign(auth, { status: 'authenticated', currentUser: { id: OWNER_ID, role: 'OWNER', name: 'Olga Ruiz' } });
  token = mockToken('OWNER', OWNER_ID);
};
const asGuest = () => {
  Object.assign(auth, { status: 'authenticated', currentUser: { id: GUEST_ID, role: 'GUEST', name: 'Ana' } });
  token = mockToken('GUEST', GUEST_ID);
};

const renderApp = (route: string) => renderWithProviders(<BookingProvider><AppRoutes /></BookingProvider>, { route });

const fill = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const image = (name = 'portada.jpg', bytes = 2048, type = 'image/jpeg') => new File([new Uint8Array(bytes)], name, { type });

function fillPublishForm(name: string) {
  fill('Tipo de alojamiento', 'HOUSE');
  fill('Nombre', name);
  fill('Descripción', 'Frente al lago, con muelle privado.');
  fill('Dirección', 'Ruta 40 km 3');
  fill('Ciudad', 'Villa La Angostura');
  fill('Región o estado', 'Neuquén');
  fill(/País/, 'ar');
  fireEvent.click(screen.getByLabelText('Wi-Fi'));
  fill('Nombre de la habitación', 'Cabaña completa');
  fill('Capacidad', '4');
  fill('Precio por noche', '150.50');
}

describe('guest journey (public)', () => {
  it('goes home → search with filters → results → PUBLISHED detail, without owner options', async () => {
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Recomendado para ti' })).toBeInTheDocument();
    // A visitor has no owner session: no owner menu, and the sign-in action is offered instead.
    // (A public "become a host" CTA may exist for everyone; it is not an owner control.)
    expect(screen.queryByText('Panel de anfitrión')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument();

    // Search filtered by keyword.
    fill('Destino', 'Tulum');
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() => expect(locationRef.current?.pathname).toBe('/search'));

    // Open the published result.
    fireEvent.click(await screen.findByRole('link', { name: /Casa Azul Frente al Mar/ }));
    await waitFor(() => expect(locationRef.current?.pathname).toBe(`/property/${PROPERTY_IDS.casaAzul}`));
    expect(await screen.findByRole('heading', { level: 1, name: 'Casa Azul Frente al Mar' })).toBeInTheDocument();
    expect(screen.getByText(/Paraíso tropical/)).toBeInTheDocument();
    // No owner-only controls on a public detail.
    expect(screen.queryByRole('link', { name: /Editar/i })).not.toBeInTheDocument();
  });
});

describe('owner journey (OWNER)', () => {
  it('publishes a property, finds it in "my properties", edits it, and the change propagates', async () => {
    asOwner();
    const name = 'Cabaña E2E del Lago';
    const edited = 'Cabaña E2E del Lago (editada)';

    // 1. Publish.
    const first = renderApp('/host/new');
    expect(screen.getByRole('heading', { name: 'Publicar propiedad' })).toBeInTheDocument();
    fillPublishForm(name);
    fireEvent.change(screen.getByLabelText('Agregar fotos'), { target: { files: [image()] } });
    fireEvent.click(screen.getByRole('button', { name: 'Publicar propiedad' }));
    expect(await screen.findByRole('heading', { level: 1, name }, { timeout: 3000 })).toBeInTheDocument();
    const created = mockDb.properties().find((p) => p.name === name)!;
    expect(created).toMatchObject({ status: 'PUBLISHED', ownerId: OWNER_ID });
    expect(locationRef.current?.pathname).toBe(`/property/${created.id}`);
    first.unmount();

    // 2. It appears in "my properties"; open its editor.
    const second = renderApp('/host/properties');
    const editLink = await screen.findByRole('link', { name: `Editar ${name}` });
    expect(screen.getAllByText('Publicada').length).toBeGreaterThan(0);
    fireEvent.click(editLink);
    await waitFor(() => expect(locationRef.current?.pathname).toBe(`/host/properties/${created.id}/edit`));

    // 3. Edit and save → lands on the updated detail.
    expect(await screen.findByDisplayValue(name)).toBeInTheDocument();
    fill('Nombre', edited);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(locationRef.current?.pathname).toBe(`/property/${created.id}`));
    expect(await screen.findByRole('heading', { level: 1, name: edited })).toBeInTheDocument();
    second.unmount();

    // 4. The listing reflects the change too.
    renderApp('/host/properties');
    expect(await screen.findByRole('link', { name: `Editar ${edited}` })).toBeInTheDocument();
  });
});

describe('security guards', () => {
  it('redirects a guest from /host/* to home with a message', async () => {
    asGuest();
    renderApp('/host/properties');
    await waitFor(() => expect(locationRef.current?.pathname).toBe('/'));
    expect(screen.getByText(/Esta sección es solo para propietarios/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Mis propiedades' })).not.toBeInTheDocument();
  });

  it('sends an anonymous visitor from /host/* to login, remembering the destination', async () => {
    renderApp('/host/new');
    await waitFor(() => expect(locationRef.current?.pathname).toBe('/login'));
    expect(screen.getByText('Inicia sesión con una cuenta de propietario para continuar.')).toBeInTheDocument();
    expect(locationRef.current?.state).toMatchObject({ from: '/host/new' });
  });
});

describe('edit error handling', () => {
  it('shows the version-conflict message when the property changed underneath (409)', async () => {
    asOwner();
    renderApp(`/host/properties/${PROPERTY_IDS.casaAzul}/edit`);
    expect(await screen.findByDisplayValue('Casa Azul Frente al Mar')).toBeInTheDocument();
    // A concurrent change bumps the server version; the in-memory form still holds the old one.
    mockDb.property(PROPERTY_IDS.casaAzul)!.version += 1;
    fill('Nombre', 'Casa Azul renovada');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('La propiedad cambió mientras la editabas. Recarga para ver la última versión.')).toBeInTheDocument();
  });

  it('shows the not-found message when editing a property the owner does not own (404)', async () => {
    asOwner();
    // Hacienda belongs to another owner: it preloads (PUBLISHED) but the PUT is rejected as 404.
    renderApp(`/host/properties/${PROPERTY_IDS.hacienda}/edit`);
    expect(await screen.findByDisplayValue('Hacienda Las Flores')).toBeInTheDocument();
    fill('Nombre', 'Intento ajeno');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('No encontramos la propiedad o no te pertenece.')).toBeInTheDocument();
  });

  it('shows the permission message when the server forbids the edit (403)', async () => {
    asOwner();
    server.use(mock.put('*/api/v1/properties/:id', () => problem(403, 'FORBIDDEN'), { once: true }));
    renderApp(`/host/properties/${PROPERTY_IDS.casaAzul}/edit`);
    expect(await screen.findByDisplayValue('Casa Azul Frente al Mar')).toBeInTheDocument();
    fill('Nombre', 'Casa Azul sin permiso');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Solo los propietarios pueden publicar alojamientos.')).toBeInTheDocument();
  });
});
