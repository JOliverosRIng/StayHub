import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Register } from './Register';
import { Login } from './Login';
import { ApiError } from '../api/identity';
const auth = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
beforeEach(() => { auth.login.mockReset(); auth.register.mockReset(); });
afterEach(cleanup);
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
function registerForm() {
  const onSuccess = vi.fn(); render(<Register onNavigate={vi.fn()} onSuccess={onSuccess} />);
  fill('Nombre completo', 'Ana Pérez'); fill('Correo electrónico', 'ana@example.test');
  fill('Contraseña', '  password  '); fill('Confirmar contraseña', '  password  ');
  return onSuccess;
}
describe('identity forms', () => {
  it('requires a deliberate public role and hides unimplemented providers', () => {
    registerForm(); fireEvent.click(screen.getByRole('button', { name: /Crear cuenta en StayHub/ }));
    expect(auth.register).not.toHaveBeenCalled(); expect(screen.getByText('Selecciona huésped o propietario')).toBeInTheDocument();
    expect(screen.queryByText('Google')).not.toBeInTheDocument();
  });
  it.each(['GUEST', 'OWNER'])('sends exact contract for %s and directs success to login', async role => {
    auth.register.mockResolvedValue({}); const success = registerForm(); fill('Tipo de cuenta', role);
    fireEvent.click(screen.getByRole('button', { name: /Crear cuenta en StayHub/ }));
    await waitFor(() => expect(success).toHaveBeenCalledWith('ana@example.test'));
    expect(auth.register).toHaveBeenCalledWith({ name: 'Ana Pérez', email: 'ana@example.test', password: '  password  ', role }, expect.any(String));
    expect(Object.keys(auth.register.mock.calls[0]![0])).not.toContain('confirm');
  });
  it('retains idempotency on ambiguous failure and changes it after editing', async () => {
    auth.register.mockRejectedValue(new ApiError(503)); registerForm(); fill('Tipo de cuenta', 'GUEST');
    const submit = () => fireEvent.click(screen.getByRole('button', { name: /Crear cuenta en StayHub/ }));
    submit(); await screen.findByRole('alert'); const key = auth.register.mock.calls[0]![1];
    submit(); await waitFor(() => expect(auth.register).toHaveBeenCalledTimes(2));
    expect(auth.register.mock.calls[1]![1]).toBe(key);
    await waitFor(() => expect(screen.getByLabelText('Nombre completo')).not.toBeDisabled());
    fill('Nombre completo', 'Otra persona'); submit(); await waitFor(() => expect(auth.register).toHaveBeenCalledTimes(3));
    expect(auth.register.mock.calls[2]![1]).not.toBe(key);
  });
  it('checks name and password bounds before sending', () => {
    registerForm(); fill('Tipo de cuenta', 'OWNER'); fill('Nombre completo', 'A'); fill('Contraseña', 'x'.repeat(129)); fill('Confirmar contraseña', 'x'.repeat(129));
    fireEvent.click(screen.getByRole('button', { name: /Crear cuenta en StayHub/ }));
    expect(auth.register).not.toHaveBeenCalled(); expect(screen.getByText(/nombre debe tener entre/)).toBeInTheDocument(); expect(screen.getByText(/contraseña admite hasta/)).toBeInTheDocument();
  });
  it('awaits login and blocks double submission without transforming password', async () => {
    let finish!: () => void; auth.login.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const success = vi.fn(); render(<Login onNavigate={vi.fn()} onSuccess={success} initialEmail="ana@example.test" registered />);
    fill('Contraseña', '  password  '); const button = screen.getByRole('button', { name: /Iniciar sesión/ });
    fireEvent.click(button); fireEvent.click(button); expect(auth.login).toHaveBeenCalledTimes(1); expect(success).not.toHaveBeenCalled();
    expect(auth.login).toHaveBeenCalledWith('ana@example.test', '  password  '); finish(); await waitFor(() => expect(success).toHaveBeenCalledTimes(1));
  });
});

describe('identity validation and recovery', () => {
  it.each([400, 401, 429, 503])('shows safe login error for HTTP %i and permits another attempt', async status => {
    auth.login.mockRejectedValue(new ApiError(status, undefined, 30));
    render(<Login onNavigate={vi.fn()} onSuccess={vi.fn()} initialEmail="ana@example.test" />);
    fill('Contraseña', 'password'); fireEvent.click(screen.getByRole('button', { name: /Iniciar sesión/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(new ApiError(status, undefined, 30).message);
    await waitFor(() => expect(screen.getByLabelText('Contraseña')).not.toBeDisabled());
  });
  it('rejects missing, malformed and oversized login data without a request', () => {
    render(<Login onNavigate={vi.fn()} onSuccess={vi.fn()} />);
    const submit = () => fireEvent.click(screen.getByRole('button', { name: /Iniciar sesión/ }));
    submit(); expect(screen.getByText('El correo es obligatorio')).toBeInTheDocument();
    fill('Correo electrónico', 'bad'); submit(); expect(screen.getByText('Ingresa un correo válido')).toBeInTheDocument();
    fill('Correo electrónico', 'a'.repeat(255)); fill('Contraseña', 'x'.repeat(129)); submit();
    expect(screen.getByText('El correo admite hasta 254 caracteres')).toBeInTheDocument();
    expect(screen.getByText('La contraseña admite hasta 128 caracteres')).toBeInTheDocument(); expect(auth.login).not.toHaveBeenCalled();
  });
  it('supports password visibility and navigation without sending a form', () => {
    const navigate = vi.fn(); render(<Login onNavigate={navigate} onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' })); expect(screen.getByLabelText('Contraseña')).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar contraseña' }));
    fireEvent.click(screen.getByRole('button', { name: 'Regístrate gratis' })); expect(navigate).toHaveBeenLastCalledWith('register');
    fireEvent.click(screen.getByRole('button', { name: /Explorar destinos/ })); expect(navigate).toHaveBeenLastCalledWith('home'); expect(auth.login).not.toHaveBeenCalled();
  });
  it('rejects mismatched and short registration passwords and invalid email', () => {
    registerForm(); fill('Tipo de cuenta', 'GUEST'); fill('Correo electrónico', 'bad'); fill('Contraseña', 'short'); fill('Confirmar contraseña', 'different');
    fireEvent.click(screen.getByRole('button', { name: /Crear cuenta/ }));
    expect(auth.register).not.toHaveBeenCalled(); expect(screen.getByText('Las contraseñas no coinciden')).toBeInTheDocument(); expect(screen.getByText('La contraseña debe tener mínimo 8 caracteres')).toBeInTheDocument();
  });
  it('blocks duplicate registration while the request is pending', async () => {
    let finish!: () => void; auth.register.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const success = registerForm(); fill('Tipo de cuenta', 'OWNER'); const button = screen.getByRole('button', { name: /Crear cuenta/ });
    fireEvent.click(button); fireEvent.click(button); expect(auth.register).toHaveBeenCalledTimes(1); expect(success).not.toHaveBeenCalled(); finish(); await waitFor(() => expect(success).toHaveBeenCalledTimes(1));
  });
});
