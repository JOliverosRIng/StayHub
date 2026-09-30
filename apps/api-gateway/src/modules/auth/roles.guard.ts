import {
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  type CanActivate,
  type CustomDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { UserRole } from '@gateway/application/ports/jwt-verifier.port';

import { principalFrom } from './access.guard';
import { isPublicRoute } from './public.decorator';

/**
 * GW-040 — Guard global de autorización por rol (FR-013, Constitution V).
 *
 * Se ejecuta DESPUÉS de {@link AccessGuard} (orden de registro `APP_GUARD`), de modo que la
 * precedencia sea 401 → 403: nunca se responde 403 a quien no está autenticado, ni se llega a
 * consultar el rol de una sesión que no ha sido validada.
 *
 * Autoriza contra el rol de la sesión ya validada e introspeccionada. El rol del JWT solo llega
 * aquí después de coincidir con el rol autoritativo de Auth (FR-009), por lo que no existe una
 * segunda fuente de verdad. Sin `@Roles(...)` la ruta no exige rol: la autenticación global basta.
 * El rechazo ocurre antes del manejador, así que no se aplica ningún cambio (FR-013).
 */

export const ROLES_KEY = 'gateway:roles';

/** Declara los roles admitidos por un manejador o un controlador. */
export const Roles = (...roles: readonly UserRole[]): CustomDecorator<string> =>
  SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  public constructor(private readonly reflector: Reflector) {}

  /**
   * Devuelve siempre una promesa: el rechazo viaja como promesa rechazada y nunca como excepción
   * síncrona, para que la precedencia se aplique igual tanto si Nest encadena el guard como si se
   * invoca directamente en una prueba. No hay E/S que await: solo metadatos y el principal ya
   * validado por `AccessGuard`.
   */
  public canActivate(context: ExecutionContext): Promise<boolean> {
    if (isPublicRoute(this.reflector, context)) return Promise.resolve(true);

    const required = this.requiredRoles(context);
    if (required === undefined || required.length === 0) return Promise.resolve(true);

    // Sin principal validado el orden de precedencia exige 401, no 403: así 403 nunca filtra
    // información de autorización a quien no acreditó sesión.
    const principal = principalFrom(context.switchToHttp().getRequest<Request>());
    if (principal === undefined) {
      return Promise.reject(new UnauthorizedException({ code: 'AUTHENTICATION_REQUIRED' }));
    }
    if (!required.includes(principal.role)) {
      return Promise.reject(new ForbiddenException({ code: 'ROLE_NOT_ALLOWED' }));
    }
    return Promise.resolve(true);
  }

  private requiredRoles(context: ExecutionContext): readonly UserRole[] | undefined {
    const declared = this.reflector.getAllAndOverride<unknown>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    return Array.isArray(declared) ? (declared as readonly UserRole[]) : undefined;
  }
}
