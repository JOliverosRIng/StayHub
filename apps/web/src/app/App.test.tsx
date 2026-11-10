import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GUEST_ID, PROPERTY_IDS } from '../../test/msw/fixtures';
import { locationRef, renderWithProviders } from '../../test/utils';
import { BookingProvider } from '../context/BookingContext';
import { AppRoutes } from './routes';

type User = { id: string; role: 'GUEST' | 'OWNER'; name: string; email?: string };
const auth = vi.hoisted(() => ({
  status: 'anonymous' as string,
  currentUser: null as User | null,
  error: undefined as string | undefined,
  login: vi.fn(), register: vi.fn(), logout: vi.fn(), retrySession: vi.fn(), retryProfile: vi.fn(),
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));

beforeEach(() => {
  Object.assign(auth, { status: 'anonymous', currentUser: null, error: undefined });
  auth.login.mockReset(); auth.register.mockReset();
  localStorage.removeItem('stayhub_bookings');
});

const renderApp = (route: string | { pathname: string; search?: string; state?: unknown }) =>
  renderWithProviders(<BookingProvider><AppRoutes /></BookingProvider>, { route });

const signInOnSubmit = (user: User) => auth.login.mockImplementation(async () => { auth.status = 'authenticated'; auth.currentUser = user; });

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().split('T')[0]!;

describe('route tree', () => {
  it.each([
    ['/', { name: 'Recomendado para ti' }],
    ['/search?q=hotel', { name: 'Buscar alojamientos' }],
    [`/property/${PROPERTY_IDS.villa}`, { name: 'Villa Serena Boutique Hotel & Spa', level: 1 }],
    ['/login', { name: 'Te damos la bienvenida a StayHub' }],
    ['/register', { name: 'Crea tu cuenta en StayHub' }],
    ['/bookings', { name: 'Inicia sesión para ver tus reservas' }],
  ])('renders %s', async (route, heading) => {
    renderApp(route);
    expect(await screen.findByRole('heading', heading)).toBeInTheDocument();
  });

  it('redirects unknown paths to home', async () => {
    renderApp('/no-existe');
    await waitFor(() => expect(locationRef.current?.pathname).toBe('/'));
  });

  it('waits for the session before rendering pages and offers recovery when it is unavailable', () => {
    auth.status = 'checking';
    const { unmount } = renderApp('/');
    expect(screen.getByRole('status')).toHaveTextContent('Comprobando sesión…');
    unmount();
    Object.assign(auth, { status: 'unavailable', error: 'No pudimos comprobar la sesión. Intenta nuevamente.' });
    renderApp('/');
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos comprobar la sesión');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(auth.retrySession).toHaveBeenCalled();
  });
});

describe('return after login', () => {
  it('returns to the page where the user clicked "Iniciar sesión"', async () => {
    signInOnSubmit({ id: GUEST_ID, role: 'GUEST', name: 'Ana' });
    renderApp('/search?q=hotel');
    fireEvent.click(await screen.findByRole('button', { name: 'Iniciar sesión' }));
    expect(locationRef.current?.pathname).toBe('/login');
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'ana@example.test' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: /Iniciar sesión →/ }));
    await waitFor(() => expect(`${locationRef.current?.pathname}${locationRef.current?.search}`).toBe('/search?q=hotel'));
  });

  it('keeps the return path through registration', async () => {
    auth.register.mockResolvedValue({});
    renderApp({ pathname: '/login', state: { from: '/search?q=mar' } });
    fireEvent.click(screen.getByRole('button', { name: 'Regístrate gratis' }));
    fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: 'Ana Pérez' } });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'ana@example.test' } });
    fireEvent.change(screen.getByLabelText('Tipo de cuenta'), { target: { value: 'GUEST' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'password1' } });
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: 'password1' } });
    fireEvent.click(screen.getByRole('button', { name: /Crear cuenta en StayHub/ }));
    expect(await screen.findByText('Cuenta creada. Inicia sesión para continuar.')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo electrónico')).toHaveValue('ana@example.test');
    expect(locationRef.current?.state).toMatchObject({ from: '/search?q=mar' });
  });

  it('ignores external return paths', async () => {
    signInOnSubmit({ id: GUEST_ID, role: 'GUEST', name: 'Ana' });
    renderApp({ pathname: '/login', state: { from: '//evil.example/x' } });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'ana@example.test' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: /Iniciar sesión →/ }));
    await waitFor(() => expect(locationRef.current?.pathname).toBe('/'));
  });

  it('resumes a booking started before login on the same property', async () => {
    signInOnSubmit({ id: GUEST_ID, role: 'GUEST', name: 'Ana' });
    renderApp(`/property/${PROPERTY_IDS.casaAzul}`);
    await screen.findByRole('heading', { level: 1, name: 'Casa Azul Frente al Mar' });
    fireEvent.change(screen.getByLabelText('ENTRADA'), { target: { value: day(30) } });
    fireEvent.change(screen.getByLabelText('SALIDA'), { target: { value: day(32) } });
    fireEvent.click(screen.getByRole('button', { name: /Inicia sesión para reservar/ }));
    expect(locationRef.current?.pathname).toBe('/login');
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'ana@example.test' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: /Iniciar sesión →/ }));
    expect(await screen.findByRole('heading', { name: 'Confirma tu reserva' })).toBeInTheDocument();
    expect(locationRef.current?.pathname).toBe(`/property/${PROPERTY_IDS.casaAzul}`);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));
    expect(screen.getByText('¡Reserva confirmada!')).toBeInTheDocument();
    await waitFor(() => expect(locationRef.current?.state).toBeNull());
  });
});
