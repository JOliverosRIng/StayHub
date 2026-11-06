import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { identityApi, type RegisterRequest } from '../api/identity';
import { session, type SessionState } from '../api/session';

interface AuthContextType extends SessionState {
  login: typeof session.login;
  register: (data: RegisterRequest, key: string) => ReturnType<typeof identityApi.register>;
  logout: typeof session.logout;
  retrySession: typeof session.restore;
  retryProfile: typeof session.retryProfile;
}
const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const state = useSyncExternalStore(session.subscribe, session.snapshot);
  useEffect(() => { void session.initialize(); }, []);
  return <AuthContext.Provider value={{ ...state, login: session.login, register: identityApi.register,
    logout: session.logout, retrySession: session.restore, retryProfile: session.retryProfile }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
