import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

import { principalFrom } from '@gateway/modules/auth/access.guard';

import { userIdOf } from './profile-request';

/**
 * GW-053 — Ownership del perfil (FR-020–FR-021, SC-004, constitución §V).
 *
 * Autoriza el acceso a `/users/{userId}/profile[/photo]` comparando el `sub` del bearer YA validado
 * (el principal que dejó {@link principalFrom} tras GW-040/GW-039/GW-016) con el `userId` de la ruta.
 * Solo el dueño de la identidad puede operar sobre su propio perfil:
 *
 * - `principal.sub !== route.userId` → `403` uniforme (Problem Details). No se revela si el `userId`
 *   destino existe: la decisión es idéntica para un perfil ajeno existente o inexistente, porque se
 *   toma ANTES de contactar a Users y sin consultar su estado (no hay fuga de existencia).
 * - **ADMIN no tiene privilegio implícito**: no se inspecciona el rol, de modo que un ADMIN sobre un
 *   perfil ajeno recibe el mismo `403`. La elevación entre identidades, de existir, sería una ruta
 *   administrativa explícita, nunca un efecto lateral de este flujo.
 * - Se ejecuta ANTES del manejador, así que una operación no autorizada **no contacta a Users**
 *   (ni lee ni escribe estado aguas abajo). El rechazo es previo y sin efectos.
 *
 * Reutiliza la autenticación de GW-040 (no la duplica): si llega sin principal validado —algo que el
 * `AccessGuard` global ya habría impedido con `401`— responde `401`, preservando la precedencia
 * `401 → 403` para que un `403` nunca se emita a quien no acreditó sesión.
 *
 * Orden del pipeline: Passport → introspección → **ownership** → routing. El cableado canónico es
 * GW-054; aquí se implementa y activa el guard sobre las rutas de perfil.
 */
@Injectable()
export class ProfileOwnershipGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    const principal = principalFrom(request);
    if (principal === undefined) {
      throw new UnauthorizedException({ code: 'AUTHENTICATION_REQUIRED' });
    }

    if (principal.userId !== userIdOf(request)) {
      throw new ForbiddenException({ code: 'PROFILE_ACCESS_FORBIDDEN' });
    }

    return true;
  }
}
