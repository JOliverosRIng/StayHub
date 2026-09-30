import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';

/**
 * GW-017 + GW-052 — Saneamiento de cabeceras de identidad y confianza en el borde.
 *
 * Elimina de TODA petición entrante cualquier cabecera de identidad, forwarding/IP, credencial de
 * servicio o token alternativo aportado por el cliente, ANTES del enrutado hacia Auth/Users. Con
 * ello se garantiza (FR-011–FR-013, FR-020–FR-024, constitución §V):
 *
 * - La identidad efectiva proviene EXCLUSIVAMENTE del bearer validado por el guard (GW-040), nunca
 *   de cabeceras del cliente (`x-user-id`, `x-user-role`, `x-sub`, `x-roles`, `x-principal`, …).
 * - Los `X-Forwarded-*`/IP falsos no alteran el origen confiable: el origen se decide solo con
 *   GW-013 (`TrustedOriginService`), que únicamente honra el reenvío del proxy inmediato permitido;
 *   aquí, como defensa en profundidad, se eliminan además todas las cabeceras de forwarding del
 *   cliente para que no puedan leerse en ningún punto posterior ni reenviarse aguas abajo.
 * - Un service JWT/credencial de servicio del cliente se elimina: solo el Gateway lo emite (GW-018).
 * - Un bearer duplicado/conflictivo no confunde ni escala identidad: Node conserva una sola cabecera
 *   `authorization` y se eliminan las cabeceras portadoras de tokens alternativos
 *   (`x-authorization`, `x-access-token`, `proxy-authorization`, …), de modo que la única credencial
 *   que sobrevive es la `authorization` que valida el guard.
 * - La allowlist de salida hacia Auth/Users (GW-018) parte de una petición ya saneada, por lo que no
 *   deja pasar identidad no validada.
 *
 * Endurece a GW-017 sin duplicar lógica: mantiene el mismo API (`STRIPPED_REQUEST_HEADERS`,
 * `stripClientHeaders`, `IdentityHeaderInterceptor`) y amplía la cobertura.
 */

/** Cabeceras de identidad inyectables por el cliente. La identidad real solo sale del bearer. */
const IDENTITY_HEADERS: readonly string[] = [
  'x-user-id',
  'x-userid',
  'x-user',
  'x-user-role',
  'x-user-roles',
  'x-user-email',
  'x-user-name',
  'x-user-groups',
  'x-roles',
  'x-role',
  'x-sub',
  'x-subject',
  'x-principal',
  'x-session-id',
  'x-authenticated-user',
  'x-gateway-user',
  'x-forwarded-user',
  'x-remote-user',
  'remote-user',
  'x-auth-user',
  'x-auth-request-user',
  'x-auth-request-email',
  'x-auth-request-groups',
];

/** Cabeceras de forwarding/IP del cliente. El origen confiable solo lo decide GW-013. */
const FORWARDING_HEADERS: readonly string[] = [
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-port',
  'x-forwarded-prefix',
  'x-forwarded-scheme',
  'x-forwarded-server',
  'x-forwarded-client-cert',
  'x-original-forwarded-for',
  'x-real-ip',
  'x-client-ip',
  'x-cluster-client-ip',
  'true-client-ip',
  'cf-connecting-ip',
  'fastly-client-ip',
  'x-appengine-user-ip',
  'forwarded',
];

/** Credenciales de servicio: solo el Gateway las emite (GW-018); nunca se aceptan del cliente. */
const SERVICE_HEADERS: readonly string[] = [
  'x-service-token',
  'x-service-auth',
  'x-service-jwt',
  'x-service-authorization',
  'x-api-key',
  'x-internal-token',
  'x-internal-auth',
];

/** Portadores de token alternativos: se eliminan para que la única credencial sea `authorization`. */
const ALTERNATE_TOKEN_HEADERS: readonly string[] = [
  'proxy-authorization',
  'x-authorization',
  'x-original-authorization',
  'x-forwarded-authorization',
  'x-access-token',
  'x-id-token',
  'x-jwt',
  'x-jwt-assertion',
  'x-auth-token',
];

export const STRIPPED_REQUEST_HEADERS: readonly string[] = [
  ...IDENTITY_HEADERS,
  ...FORWARDING_HEADERS,
  ...SERVICE_HEADERS,
  ...ALTERNATE_TOKEN_HEADERS,
];

const STRIPPED = new Set(STRIPPED_REQUEST_HEADERS);

/**
 * Prefijos de familias enteras de cabeceras que se eliminan aunque aparezcan variantes no listadas
 * explícitamente (p. ej. `x-forwarded-*`, `x-service-*`). Cierra la puerta a nuevos vectores de
 * suplantación sin tener que enumerarlos uno a uno.
 */
const STRIPPED_PREFIXES: readonly string[] = ['x-forwarded-', 'x-service-'];

function isStripped(name: string): boolean {
  if (STRIPPED.has(name)) return true;
  return STRIPPED_PREFIXES.some((prefix) => name.startsWith(prefix));
}

@Injectable()
export class IdentityHeaderInterceptor implements NestInterceptor {
  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    stripClientHeaders(context.switchToHttp().getRequest<Request>());
    return next.handle();
  }
}

export function stripClientHeaders(request: Request): void {
  const headers = request.headers as Record<string, unknown>;
  for (const name of Object.keys(headers)) {
    if (isStripped(name.toLowerCase())) delete headers[name];
  }
}
