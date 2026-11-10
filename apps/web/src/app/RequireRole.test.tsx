import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GUEST_ID, OWNER_ID } from '../../test/msw/fixtures';
import { locationRef, renderWithProviders } from '../../test/utils';
import { BookingProvider } from '../context/BookingContext';
import { AppRoutes } from './routes';

type User = { id: string; role: 'GUEST' | 'OWNER'; name: string };
const auth = vi.hoisted(() => ({
  status: 'anonymous' as string, currentUser: null as User | null,
  login: vi.fn(), register: vi.fn(), logout: vi.fn(), retrySession: vi.fn(), retryProfile: vi.fn(),
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));

beforeEach(() => { Object.assign(auth, { status: 'anonymous', currentUser: null }); auth.login.mockReset(); });

const renderAt = (route: string) => renderWithProviders(<BookingProvider><AppRoutes /></BookingProvider>, { route });
const owner: User = { id: OWNER_ID, role: 'OWNER', name: 'Olga Ruiz' };
const guest: User = { id: GUEST_ID, role: 'GUEST', name: 'Ana' };

describe('owner routes', () => {
  it('lets an owner open the publish form and the host panel', async () => {
    Object.assign(auth, { status: 'authenticated', currentUser: owner });
    const { unmount } = renderAt('/host/new');
    expect(screen.getByRole('heading', { name: 'Publicar propiedad' })).toBeInTheDocument();
    unmount();
    renderAt('/host');
    expect(screen.getByRole('heading', { name: 'Hola, Olga' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Publicar una propiedad' }));
    expect(locationRef.current?.pathname).toBe('/host/new');
  });

  it('sends anonymous visitors to login with a message and returns them after an owner login', async () => {
    auth.login.mockImplementation(async () => { Object.assign(auth, { status: 'authenticated', currentUser: owner }); });
    renderAt('/host/new');
    expect(locationRef.current?.pathname).toBe('/login');
    expect(screen.getByText('Inicia sesión con una cuenta de propietario para continuar.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'olga@example.test' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: /Iniciar sesión →/ }));
    expect(await screen.findByRole('heading', { name: 'Publicar propiedad' })).toBeInTheDocument();
  });

  it.each(['/host', '/host/new'])('redirects guests from %s to home with a message', async (route) => {
    Object.assign(auth, { status: 'authenticated', currentUser: guest });
    renderAt(route);
    await waitFor(() => expect(locationRef.current?.pathname).toBe('/'));
    expect(screen.getByText(/Esta sección es solo para propietarios/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Publicar propiedad' })).not.toBeInTheDocument();
  });

  it('shows owner shortcuts only to owners', async () => {
    Object.assign(auth, { status: 'authenticated', currentUser: guest });
    const { unmount } = renderAt('/');
    fireEvent.click(screen.getByRole('button', { name: /Ana/ }));
    expect(screen.queryByRole('button', { name: 'Publicar propiedad' })).not.toBeInTheDocument();
    unmount();
    Object.assign(auth, { currentUser: owner });
    renderAt('/');
    fireEvent.click(screen.getByRole('button', { name: /Olga/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Publicar propiedad' }));
    expect(locationRef.current?.pathname).toBe('/host/new');
  });
});
