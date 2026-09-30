import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import {
  JWT_VERIFIER,
  type AccessTokenVerifier,
  type UserRole,
  type VerifiedUserClaims,
} from '@gateway/application/ports/jwt-verifier.port';
import type { AuthoritativeSession } from '@gateway/infrastructure/http/auth-session.client';
import { traceIdFromRequest } from '@gateway/interfaces/http/trace-id';

import { extractBearerToken, type AuthenticatedPrincipal } from './jwt.strategy';
import { isPublicRoute } from './public.decorator';
import type { ValidatedPrincipal } from './session-introspection.service';

/**
 * GW-040 — Guard global de autenticación (FR-009–FR-013, SC-003).
 *
 * Se aplica a TODA ruta salvo las marcadas con `@Public()`. Antes de autorizar ejecuta, en orden:
 *
 * 1. **Verificación del JWT RS256** reutilizando el puerto `JWT_VERIFIER` de GW-016 (`JwtVerifierService`),
 *    incluida la extracción del bearer. Ausente, inválido o vencido → `401` (FR-012), sin tocar Auth.
 * 2. **Introspección obligatoria** de `sub`/`sid` con el servicio de GW-039, que es la única fuente
 *    autoritativa del estado de la sesión y del rol (FR-009). No es opcional ni cacheable: si no se
 *    conoce el estado real de la sesión no hay decisión de acceso que tomar.
 * 3. **Coherencia de rol**: el `role` del JWT debe coincidir con el rol autoritativo. Una divergencia
 *    invalida la credencial y se responde `401`.
 *
 * Fallo cerrado: la indisponibilidad de Auth se propaga como `GatewayDependencyError`, que
 * `ProblemDetailsFilter` traduce a `503` (ningún paso se concede ante incertidumbre, y ningún estado
 * parcial se aplica porque la denegación ocurre antes del manejador).
 *
 * Precedencia `401 → 403` (AGENT.md §4.4): este guard es el primero registrado y {@link RolesGuard}
 * el segundo, de forma que la autorización por rol solo se evalúa sobre una sesión ya validada.
 * Expone el principal en `request.user` para los guards y el proxy de las historias siguientes.
 */

/** Token de inyección de la introspección de sesión; la implementación es la de GW-039. */
export const SESSION_INTROSPECTION = Symbol('SESSION_INTROSPECTION');

/**
 * Contrato mínimo que el guard necesita de la introspección. Se declara la necesidad estructural en
 * lugar de la clase concreta para que GW-033 pueda verificarla con dobles y para que GW-039 conserve
 * la propiedad de su implementación.
 */
export interface SessionIntrospection {
  introspect(session: ValidatedPrincipal, traceId?: string): Promise<AuthoritativeSession>;
}

const KNOWN_ROLES: readonly UserRole[] = ['GUEST', 'OWNER', 'ADMIN'];

interface RequestWithPrincipal extends Request {
  user?: AuthenticatedPrincipal;
}

@Injectable()
export class AccessGuard implements CanActivate {
  public constructor(
    @Inject(JWT_VERIFIER) private readonly verifier: AccessTokenVerifier,
    @Inject(SESSION_INTROSPECTION) private readonly introspection: SessionIntrospection,
    private readonly reflector: Reflector,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    if (isPublicRoute(this.reflector, context)) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const claims = await this.authenticate(request);
    const session = await this.authoritativeSession(claims, request);
    this.assertRoleCoherence(claims, session);
    (request as RequestWithPrincipal).user = {
      userId: claims.sub,
      sessionId: claims.sid,
      role: claims.role,
      jti: claims.jti,
      exp: claims.exp,
    };
    return true;
  }

  /** `401` por token ausente, inválido o vencido (FR-012). Ocurre antes de cualquier autorización. */
  private async authenticate(request: Request): Promise<VerifiedUserClaims> {
    const token = extractBearerToken(request);
    if (token === undefined) {
      throw new UnauthorizedException({ code: 'ACCESS_TOKEN_REQUIRED' });
    }
    try {
      return await this.verifier.verify(token);
    } catch {
      throw new UnauthorizedException({ code: 'ACCESS_TOKEN_INVALID' });
    }
  }

  /**
   * Introspección obligatoria (GW-039). Una sesión que Auth no reconoce como activa es `401`; una
   * respuesta inesperada o caída de Auth se propaga como `GatewayDependencyError` → `503`.
   */
  private async authoritativeSession(
    claims: VerifiedUserClaims,
    request: Request,
  ): Promise<AuthoritativeSession> {
    const session = await this.introspection.introspect(
      { userId: claims.sub, sessionId: claims.sid },
      traceIdFromRequest(request),
    );
    if (!session.active) {
      throw new UnauthorizedException({ code: 'SESSION_NOT_ACTIVE' });
    }
    return session;
  }

  /** El rol viaja en la sesión; si el JWT dice otra cosa, la credencial no es de fiar (FR-009). */
  private assertRoleCoherence(
    claims: VerifiedUserClaims,
    session: AuthoritativeSession,
  ): void {
    if (toUserRole(session.role) !== claims.role) {
      throw new UnauthorizedException({ code: 'SESSION_ROLE_MISMATCH' });
    }
  }
}

/** Devuelve el principal validado por este guard, o `undefined` si la petición no está autenticada. */
export function principalFrom(request: Request): AuthenticatedPrincipal | undefined {
  return (request as RequestWithPrincipal).user;
}

function toUserRole(role: string): UserRole | undefined {
  return KNOWN_ROLES.find((known) => known === role);
}
