export type Role = 'GUEST' | 'OWNER' | 'ADMIN';
export interface RegisterRequest { name: string; email: string; password: string; role: Exclude<Role, 'ADMIN'> }
export interface Principal { userId: string; sessionId: string; role: Role }
export interface TokenResponse { accessToken: string; tokenType: 'Bearer'; expiresIn: number; user: Principal }
export interface Profile { id: string; name: string; email: string; role: Role; version: number }
export type UserSummary = Pick<Profile, 'id' | 'name' | 'email' | 'role'>;
export interface Problem { code?: string; traceId?: string; errors?: { field: string; code: string }[] }

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly problem?: Problem, public readonly retryAfter?: number) {
    super(status === 401 ? 'Correo o contraseña incorrectos o sesión vencida.'
      : status === 400 ? 'Revisa los datos del formulario.'
      : status === 409 ? 'El correo o la solicitud ya están en uso.'
      : status === 429 ? `Demasiados intentos.${retryAfter ? ` Espera ${retryAfter} segundos.` : ' Intenta más tarde.'}`
      : status === 403 ? 'No tienes permiso para realizar esta operación.'
      : 'El servicio no está disponible. Intenta nuevamente.');
  }
}

export async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      ...init, credentials: 'include', signal: init.signal ?? AbortSignal.timeout(15000),
      headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
    });
  } catch { throw new ApiError(0); }
  if (!response.ok) {
    let problem: Problem | undefined;
    try { problem = await response.json() as Problem; } catch { /* Proxy failures may not be JSON. */ }
    const raw = response.headers.get('Retry-After');
    const seconds = raw ? (/^\d+$/.test(raw) ? Number(raw) : Math.ceil((Date.parse(raw) - Date.now()) / 1000)) : undefined;
    throw new ApiError(response.status, problem, seconds && seconds > 0 ? seconds : undefined);
  }
  if (response.status === 204) return undefined as T;
  try { return await response.json() as T; } catch { throw new ApiError(502); }
}

export const identityApi = {
  register: (data: RegisterRequest, key: string) => request<UserSummary>('/auth/register', {
    method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(data),
  }),
  login: (email: string, password: string) => request<TokenResponse>('/auth/login', {
    method: 'POST', body: JSON.stringify({ email, password }),
  }),
  refresh: () => request<TokenResponse>('/auth/refresh', { method: 'POST' }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
};
