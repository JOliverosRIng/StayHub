import { randomUUID } from 'node:crypto';

import { HttpException } from '@nestjs/common';

import { GatewayDependencyError } from '@gateway/application/errors/gateway-errors';
import type { GatewayConfig } from '@gateway/infrastructure/config/gateway-config';
import {
  AuthSessionClient,
  type AuthoritativeSession,
  type AuthSessionClientDeps,
} from '@gateway/infrastructure/http/auth-session.client';
import type { ServiceTokenIssuer } from '@gateway/infrastructure/http/service-client.base';

/**
 * GW-039 — Introspección de sesión (FR-009–FR-013).
 *
 * Recibe `sub`/`sid` ya extraídos del JWT validado por la estrategia RS256 de GW-016 y consulta a
 * Auth mediante el cliente de introspección de GW-036 para obtener el estado de la sesión y el rol
 * autoritativo. Devuelve el rol autoritativo para que el guard (GW-040) lo compare con el rol del
 * JWT y verifique la coherencia `sub`/`sid`; una sesión inválida (`401`) se refleja como inactiva.
 *
 * Fallo cerrado: cualquier indisponibilidad de Auth (transporte caído o `5xx`) se traduce a
 * `GatewayDependencyError` (503), de modo que nunca se concede paso ante incertidumbre. No expone
 * datos sensibles: solo devuelve `{ active, role }`. No duplica transporte ni mapeo.
 */

const SERVER_ERROR_THRESHOLD = 500;
const UNAUTHORIZED_STATUS = 401;

export interface ValidatedPrincipal {
  readonly userId: string;
  readonly sessionId: string;
}

export class SessionIntrospectionService {
  private readonly client: AuthSessionClient;

  public constructor(
    config: GatewayConfig,
    serviceToken: ServiceTokenIssuer,
    deps: AuthSessionClientDeps = {},
  ) {
    this.client = new AuthSessionClient(config, serviceToken, deps);
  }

  public async introspect(
    principal: ValidatedPrincipal,
    traceId: string = randomUUID(),
  ): Promise<AuthoritativeSession> {
    try {
      return await this.client.introspect(
        { userId: principal.userId, sessionId: principal.sessionId },
        { traceId },
      );
    } catch (error) {
      if (isUnavailable(error)) {
        throw new GatewayDependencyError('auth');
      }
      if (isUnauthorized(error)) {
        // Sesión inválida/no encontrada: se refleja como inactiva (el guard responde 401).
        return { active: false, role: '' };
      }
      // Respuesta inesperada de Auth: fallar cerrado, nunca conceder paso.
      throw new GatewayDependencyError('auth');
    }
  }
}

function isUnavailable(error: unknown): boolean {
  return (
    error instanceof GatewayDependencyError ||
    (error instanceof HttpException && error.getStatus() >= SERVER_ERROR_THRESHOLD)
  );
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof HttpException && error.getStatus() === UNAUTHORIZED_STATUS;
}
