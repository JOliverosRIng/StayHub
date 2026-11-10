import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Role } from '../api/identity';
import { useAuth } from '../context/AuthContext';
import { paths, type LoginLocationState, type NoticeLocationState } from './navigation';

interface RequireRoleProps {
  role: Role;
  children: ReactNode;
  /** Shown on the login page to anonymous visitors. */
  anonymousNotice?: string;
  /** Shown on the home page to authenticated users without the role. */
  forbiddenNotice?: string;
}

/**
 * Client-side route guard. It only improves UX: the Gateway and services still authorize every
 * request (OWNER + ownership for writes).
 */
export function RequireRole({
  role, children,
  anonymousNotice = 'Inicia sesión con una cuenta de propietario para continuar.',
  forbiddenNotice = 'Esta sección es solo para propietarios. Tu cuenta de huésped no puede publicar alojamientos.',
}: RequireRoleProps) {
  const { status, currentUser } = useAuth();
  const location = useLocation();

  if (status === 'checking') return <p role="status" className="p-8">Comprobando sesión…</p>;
  if (!currentUser) {
    const state: LoginLocationState = { from: `${location.pathname}${location.search}`, notice: anonymousNotice };
    return <Navigate to={paths.login} replace state={state} />;
  }
  if (currentUser.role !== role) {
    const state: NoticeLocationState = { notice: forbiddenNotice };
    return <Navigate to={paths.home} replace state={state} />;
  }
  return <>{children}</>;
}
