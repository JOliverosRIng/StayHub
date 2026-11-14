import { AsyncLocalStorage } from 'node:async_hooks';

import { GatewayDependencyError } from '@gateway/application/errors/gateway-errors';
import type { GatewayConfig } from '@gateway/infrastructure/config/gateway-config';
import { toRemoteHttpException } from '@gateway/infrastructure/http/remote-problem.mapper';
import {
  ServiceClientBase,
  type HttpFetch,
  type ServiceResult,
} from '@gateway/infrastructure/http/service-client.base';

/**
 * Cliente del Gateway hacia Accommodations (RQ-03/RQ-05/RQ-06).
 *
 * Accommodations verifica el access JWT de Auth (`bearerAuth` en su contrato), igual que Users:
 * el `Authorization` saliente es el bearer del usuario ya validado e introspeccionado por el
 * `AccessGuard`. La lectura `GET /properties/{id}` admite anonimato: sin bearer se omite la
 * cabecera (`allowAnonymous`) y Accommodations solo devuelve propiedades publicadas.
 *
 * Reutiliza `ServiceClientBase` (timeout, circuito, reintentos seguros, allowlist) y
 * `toRemoteHttpException` para traducir los errores a Problem Details.
 */

const ACCOMMODATIONS_DEPENDENCY = 'accommodations';

export interface AccommodationsRequestContext {
  readonly traceId: string;
  /** Bearer validado por el guard; cadena vacía para lecturas anónimas. */
  readonly bearer: string;
}

export interface AccommodationsMultipart {
  readonly body: Uint8Array;
  readonly contentType: string;
}

export interface AccommodationsClientDeps {
  readonly fetch?: HttpFetch;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export class AccommodationsClient {
  private readonly base: ServiceClientBase;
  private readonly bearerStore = new AsyncLocalStorage<string>();

  public constructor(config: GatewayConfig, deps: AccommodationsClientDeps = {}) {
    this.base = new ServiceClientBase(
      {
        dependency: ACCOMMODATIONS_DEPENDENCY,
        baseUrl: config.accommodationsBaseUrl,
        circuit: config.accommodations,
        allowAnonymous: true,
      },
      {
        serviceToken: {
          issue: (): Promise<string> => Promise.resolve(this.bearerStore.getStore() ?? ''),
        },
        ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
        ...(deps.now === undefined ? {} : { now: deps.now }),
        ...(deps.sleep === undefined ? {} : { sleep: deps.sleep }),
      },
    );
  }

  public getProperty(propertyId: string, context: AccommodationsRequestContext): Promise<unknown> {
    return this.call(context, 'GET', propertyPath(propertyId));
  }

  public createProperty(body: unknown, context: AccommodationsRequestContext): Promise<unknown> {
    return this.call(context, 'POST', '/properties', jsonBody(body));
  }

  public replaceProperty(
    propertyId: string,
    body: unknown,
    context: AccommodationsRequestContext,
  ): Promise<unknown> {
    return this.call(context, 'PUT', propertyPath(propertyId), jsonBody(body));
  }

  public addPhoto(
    propertyId: string,
    multipart: AccommodationsMultipart,
    context: AccommodationsRequestContext,
  ): Promise<unknown> {
    return this.call(context, 'POST', `${propertyPath(propertyId)}/photos`, multipart);
  }

  private call(
    context: AccommodationsRequestContext,
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    payload?: AccommodationsMultipart,
  ): Promise<unknown> {
    return this.bearerStore.run(context.bearer, async () => {
      let result: ServiceResult;
      try {
        result = await this.base.request({
          method,
          path,
          traceId: context.traceId,
          ...(payload === undefined ? {} : { body: payload.body, contentType: payload.contentType }),
        });
      } catch (error) {
        if (error instanceof GatewayDependencyError) throw error;
        throw new GatewayDependencyError(ACCOMMODATIONS_DEPENDENCY);
      }
      if (result.status >= 400) throw toRemoteHttpException(result);
      try {
        return JSON.parse(new TextDecoder().decode(result.body)) as unknown;
      } catch {
        throw new GatewayDependencyError(ACCOMMODATIONS_DEPENDENCY);
      }
    });
  }
}

function propertyPath(propertyId: string): string {
  return `/properties/${encodeURIComponent(propertyId)}`;
}

function jsonBody(body: unknown): AccommodationsMultipart {
  return { body: new TextEncoder().encode(JSON.stringify(body)), contentType: 'application/json' };
}
