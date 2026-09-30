import { AsyncLocalStorage } from 'node:async_hooks';

import { GatewayDependencyError } from '@gateway/application/errors/gateway-errors';
import type { GatewayConfig } from '@gateway/infrastructure/config/gateway-config';
import { toRemoteHttpException } from '@gateway/infrastructure/http/remote-problem.mapper';
import {
  ServiceClientBase,
  type HttpFetch,
  type ServiceClientDependencies,
  type ServiceResult,
  type ServiceTokenIssuer,
} from '@gateway/infrastructure/http/service-client.base';

/**
 * GW-046 — Cliente del Gateway hacia Users para perfil y foto: GET perfil, PATCH perfil y GET foto.
 *
 * A diferencia de los clientes de Auth (service JWT), las rutas de perfil de Users usan `bearerAuth`
 * (contrato Users): el `Authorization` que viaja a Users es el **bearer YA validado del usuario**,
 * que Users revalida. Aquí no se emite service JWT. Como `ServiceClientBase` (GW-018) fija el
 * `Authorization` desde su emisor de token y el circuit breaker debe persistir entre peticiones
 * (una sola instancia de base), el bearer —que varía por petición— se resuelve con
 * `AsyncLocalStorage`, seguro ante concurrencia.
 *
 * Reutiliza GW-018 (timeout, circuit breaker, allowlist de cabeceras) y GW-019
 * (`toRemoteHttpException`) para mapear errores de Users a Problem Details preservando
 * 200/400/401/403/404/409/413/415/503. Respeta GW-017: NO reenvía ninguna cabecera de identidad
 * aportada por el cliente (no se pasan cabeceras del llamador; la base solo envía `Authorization`
 * y `x-trace-id`). Un fallo de transporte o de lectura del cuerpo (respuesta cortada a mitad) se
 * traduce a `GatewayDependencyError` (503) SIN entregar cuerpo parcial.
 *
 * Alineado con `contracts/openapi-users-service.yaml`; listo para la integración real de GW-059.
 */

const USERS_DEPENDENCY = 'users';

export interface ProfileContext {
  readonly traceId: string;
  /** Bearer del usuario ya verificado por el guard (GW-040); Users lo revalida. */
  readonly bearer: string;
}

export interface UsersProfile {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: string;
  readonly phone?: string | null;
  readonly preferences?: Record<string, unknown> | null;
  readonly photoUrl?: string | null;
  readonly version: number;
}

export interface ProfilePhoto {
  readonly contentType: string;
  readonly bytes: Uint8Array;
}

/** Cuerpo multipart ya acotado por el interceptor de streaming (GW-047), listo para reenviar. */
export interface ProfileMultipart {
  readonly body: Uint8Array;
  readonly contentType: string;
}

export interface UsersProfileClientDeps {
  readonly fetch?: HttpFetch;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export class UsersProfileClient {
  private readonly base: ServiceClientBase;
  private readonly bearerStore = new AsyncLocalStorage<string>();

  public constructor(
    config: GatewayConfig,
    _serviceToken: ServiceTokenIssuer,
    deps: UsersProfileClientDeps = {},
  ) {
    // El `Authorization` hacia Users es el bearer del usuario de la petición en curso (bearerAuth),
    // no un service JWT. Se resuelve por petición vía AsyncLocalStorage.
    const bearerIssuer: ServiceTokenIssuer = {
      issue: (): Promise<string> => {
        const bearer = this.bearerStore.getStore();
        if (bearer === undefined) {
          throw new GatewayDependencyError(USERS_DEPENDENCY);
        }
        return Promise.resolve(bearer);
      },
    };
    const dependencies: ServiceClientDependencies = {
      serviceToken: bearerIssuer,
      ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
      ...(deps.now === undefined ? {} : { now: deps.now }),
      ...(deps.sleep === undefined ? {} : { sleep: deps.sleep }),
    };
    this.base = new ServiceClientBase(
      { dependency: USERS_DEPENDENCY, baseUrl: config.usersBaseUrl, circuit: config.users },
      dependencies,
    );
  }

  public getProfile(userId: string, context: ProfileContext): Promise<UsersProfile> {
    return this.bearerStore.run(context.bearer, async () => {
      const result = await this.request('GET', profilePath(userId), context.traceId);
      return parseJson<UsersProfile>(result);
    });
  }

  public updateProfile(
    userId: string,
    context: ProfileContext,
    multipart: ProfileMultipart,
  ): Promise<UsersProfile> {
    return this.bearerStore.run(context.bearer, async () => {
      const result = await this.request('PATCH', profilePath(userId), context.traceId, multipart);
      return parseJson<UsersProfile>(result);
    });
  }

  public getProfilePhoto(userId: string, context: ProfileContext): Promise<ProfilePhoto> {
    return this.bearerStore.run(context.bearer, async () => {
      const result = await this.request('GET', photoPath(userId), context.traceId);
      if (result.status >= 400) {
        throw toRemoteHttpException(result);
      }
      return { contentType: result.headers['content-type'] ?? 'application/octet-stream', bytes: result.body };
    });
  }

  private async request(
    method: 'GET' | 'PATCH',
    path: string,
    traceId: string,
    multipart?: ProfileMultipart,
  ): Promise<ServiceResult> {
    try {
      return await this.base.request({
        method,
        path,
        traceId,
        ...(multipart === undefined
          ? {}
          : { body: multipart.body, contentType: multipart.contentType }),
      });
    } catch (error) {
      // Timeout/circuito → ya es GatewayDependencyError; cualquier otro fallo (p. ej. respuesta
      // cortada a mitad) también falla cerrado: nunca se entrega un cuerpo parcial.
      if (error instanceof GatewayDependencyError) throw error;
      throw new GatewayDependencyError(USERS_DEPENDENCY);
    }
  }
}

function profilePath(userId: string): string {
  return `/internal/v1/users/${encodeURIComponent(userId)}/profile`;
}

function photoPath(userId: string): string {
  return `/internal/v1/users/${encodeURIComponent(userId)}/profile/photo`;
}

function parseJson<T>(result: ServiceResult): T {
  if (result.status >= 400) {
    throw toRemoteHttpException(result);
  }
  try {
    return JSON.parse(new TextDecoder().decode(result.body)) as T;
  } catch {
    // Cuerpo corrupto/incompleto: se trata como dependencia caída, sin entregar datos parciales.
    throw new GatewayDependencyError(USERS_DEPENDENCY);
  }
}
