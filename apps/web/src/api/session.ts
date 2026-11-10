import { ApiError, identityApi, request, type Principal, type Profile, type TokenResponse } from './identity';

export interface SessionUser extends Principal { id: string; name: string; email?: string }
export interface SessionState {
  status: 'checking' | 'authenticated' | 'anonymous' | 'unavailable';
  currentUser: SessionUser | null;
  error?: string;
  profileUnavailable?: boolean;
  logoutFailed?: boolean;
}
interface SessionMessage { type: 'session' | 'logout'; epoch: string; pair?: TokenResponse; expiresAt?: number }
// Non-secret operation revision prevents delayed cross-tab responses from restoring logout.
const epochKey = 'stayhub_auth_epoch';
function readEpoch(): string { try { return localStorage.getItem(epochKey) ?? ''; } catch { return ''; } }
function nextEpoch(): string { const epoch = crypto.randomUUID(); try { localStorage.setItem(epochKey, epoch); } catch { /* Memory-only operation remains available. */ } return readEpoch(); }

// One instance per tab survives StrictMode remounts. Tokens never enter persistent storage.
export class SessionStore {
  private state: SessionState = { status: 'checking', currentUser: null };
  private listeners = new Set<() => void>();
  private pair?: TokenResponse;
  private expiresAt = 0;
  private generation = 0;
  private initialized?: Promise<void>;
  private refreshing?: Promise<void>;
  private timer?: ReturnType<typeof setTimeout>;
  private channel?: BroadcastChannel;

  constructor() {
    if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel('stayhub-session');
      this.channel.onmessage = ({ data }: MessageEvent<SessionMessage>) => {
        if (data.epoch !== readEpoch()) return;
        if (data.type === 'logout') { this.generation++; this.clear(); }
        else if (data.type === 'session' && data.pair && data.expiresAt && data.expiresAt > Date.now()) {
          if (this.pair?.user.sessionId !== data.pair.user.sessionId) this.generation++;
          this.accept(data.pair, data.expiresAt);
          void this.loadProfile();
        }
      };
    }
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.state;
  private publish(state: SessionState) { this.state = state; this.listeners.forEach(listener => listener()); }
  private async locked<T>(work: () => Promise<T>): Promise<T> {
    if (!navigator.locks) throw new ApiError(503);
    return navigator.locks.request('stayhub-session', work);
  }
  initialize = (): Promise<void> => {
    if (!this.initialized) {
      try { localStorage.removeItem('stayhub_users'); localStorage.removeItem('stayhub_session'); } catch { /* Storage may be disabled. */ }
      this.initialized = this.restore();
    }
    return this.initialized;
  };
  private clear(error?: string) {
    this.pair = undefined; this.expiresAt = 0; clearTimeout(this.timer);
    this.publish({ status: 'anonymous', currentUser: null, error });
  }
  private accept(pair: TokenResponse, expiresAt: number) {
    this.pair = pair; this.expiresAt = expiresAt;
    this.publish({ status: 'authenticated', currentUser: { ...pair.user, id: pair.user.userId, name: 'Mi cuenta' } });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.restore(); }, Math.max(1000, expiresAt - Date.now() - 60000));
  }
  private async loadProfile() {
    const generation = this.generation;
    const userId = this.pair?.user.userId;
    if (!userId) return;
    try {
      const profile = await this.authorized<Profile>(`/users/${userId}/profile`);
      if (generation === this.generation && this.state.currentUser) {
        this.publish({ ...this.state, profileUnavailable: false,
          currentUser: { ...this.state.currentUser, name: profile.name, email: profile.email } });
      }
    } catch {
      if (generation === this.generation && this.state.currentUser) this.publish({ ...this.state, profileUnavailable: true });
    }
  }
  retryProfile = () => this.loadProfile();
  private renew(force = false): Promise<void> {
    if (this.refreshing) return this.refreshing;
    const generation = this.generation;
    const previousToken = this.pair?.accessToken;
    this.refreshing = this.locked(async () => {
      if (generation !== this.generation && !this.pair) return;
      if (this.pair && this.expiresAt > Date.now() + 60000 && (!force || this.pair.accessToken !== previousToken)) return;
      const startGeneration = this.generation;
      const epoch = readEpoch();
      const pair = await identityApi.refresh();
      if (startGeneration !== this.generation || epoch !== readEpoch()) return;
      await request<Principal>('/auth/validate', {}, pair.accessToken);
      if (startGeneration !== this.generation || epoch !== readEpoch()) return;
      const expiresAt = Date.now() + pair.expiresIn * 1000;
      this.accept(pair, expiresAt);
      this.channel?.postMessage({ type: 'session', epoch, pair, expiresAt } satisfies SessionMessage);
    }).finally(() => { this.refreshing = undefined; });
    return this.refreshing;
  }
  private handleFailure(error: unknown) {
    if (error instanceof ApiError && error.status === 401) {
      this.generation++; nextEpoch(); this.clear('Tu sesión venció. Inicia sesión nuevamente.');
      this.channel?.postMessage({ type: 'logout', epoch: readEpoch() } satisfies SessionMessage);
    } else {
      clearTimeout(this.timer);
      this.publish({ status: 'unavailable', currentUser: null, error: 'No pudimos comprobar la sesión. Intenta nuevamente.' });
    }
  }
  restore = async () => {
    const generation = this.generation;
    try { await this.renew(this.state.status === 'unavailable'); if (this.pair) await this.loadProfile(); }
    catch (error) { if (generation === this.generation) this.handleFailure(error); }
  };
  login = async (email: string, password: string) => {
    const generation = ++this.generation;
    await this.locked(async () => {
      const epoch = nextEpoch();
      const pair = await identityApi.login(email, password);
      if (generation !== this.generation || epoch !== readEpoch()) throw new ApiError(401);
      await request<Principal>('/auth/validate', {}, pair.accessToken);
      if (generation !== this.generation || epoch !== readEpoch()) throw new ApiError(401);
      const expiresAt = Date.now() + pair.expiresIn * 1000;
      this.accept(pair, expiresAt);
      this.channel?.postMessage({ type: 'session', epoch, pair, expiresAt } satisfies SessionMessage);
    });
    await this.loadProfile();
    if (!this.state.currentUser) throw new ApiError(401);
  };
  logout = async () => {
    this.generation++; nextEpoch(); this.clear();
    this.channel?.postMessage({ type: 'logout', epoch: readEpoch() } satisfies SessionMessage);
    try { await this.locked(() => identityApi.logout()); }
    catch { this.publish({ status: 'anonymous', currentUser: null,
      logoutFailed: true, error: 'No pudimos completar el cierre en el servidor. Reintenta antes de cerrar el navegador.' }); }
  };
  /** Current bearer for external HTTP clients; never persisted. */
  accessToken = (): string | undefined => this.pair?.accessToken;
  /**
   * For external HTTP clients after a 401: renews once (deduplicated with other callers) and returns
   * the new bearer. Refresh failure clears or marks the session exactly like `authorized`.
   */
  recoverFromUnauthorized = async (): Promise<string> => {
    if (!this.pair) throw new ApiError(401);
    const generation = this.generation;
    try { await this.renew(true); }
    catch (failure) { if (generation === this.generation) this.handleFailure(failure); throw failure; }
    if (generation !== this.generation || !this.pair) throw new ApiError(401);
    return this.pair.accessToken;
  };
  /** A request retried with a fresh bearer was still rejected: the session is no longer valid. */
  expire = () => { if (this.pair) this.handleFailure(new ApiError(401)); };
  authorized = async <T,>(path: string, init?: RequestInit): Promise<T> => {
    if (!this.pair) throw new ApiError(401);
    const generation = this.generation;
    try {
      const result = await request<T>(path, init, this.pair.accessToken);
      if (generation !== this.generation) throw new ApiError(401);
      return result;
    } catch (error) {
      if (generation !== this.generation || !(error instanceof ApiError) || error.status !== 401) throw error;
    }
    try { await this.renew(true); }
    catch (failure) { if (generation === this.generation) this.handleFailure(failure); throw failure; }
    if (generation !== this.generation || !this.pair) throw new ApiError(401);
    try {
      const result = await request<T>(path, init, this.pair.accessToken);
      if (generation !== this.generation) throw new ApiError(401);
      return result;
    } catch (failure) {
      if (generation === this.generation && failure instanceof ApiError && failure.status === 401) this.handleFailure(failure);
      throw failure;
    }
  };
}

export const session = new SessionStore();
