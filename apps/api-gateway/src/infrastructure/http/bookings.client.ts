import { AsyncLocalStorage } from 'node:async_hooks';
import { importPKCS8, SignJWT } from 'jose';

import { GatewayDependencyError } from '@gateway/application/errors/gateway-errors';
import type { GatewayConfig } from '@gateway/infrastructure/config/gateway-config';
import { toRemoteHttpException } from '@gateway/infrastructure/http/remote-problem.mapper';
import { ServiceClientBase, type HttpFetch, type ServiceResult } from '@gateway/infrastructure/http/service-client.base';

export interface BookingsRequestContext { readonly traceId: string; readonly userId: string; readonly role: 'GUEST' | 'OWNER' | 'ADMIN' }
export interface BookingsClientDeps { readonly fetch?: HttpFetch; readonly now?: () => number; readonly sleep?: (ms: number) => Promise<void> }

/** Adaptador transparente Gateway -> Bookings; la autorización de recurso permanece en Bookings. */
export class BookingsClient {
  private readonly principalStore = new AsyncLocalStorage<BookingsRequestContext>();
  private readonly client: ServiceClientBase;

  public constructor(config: GatewayConfig, deps: BookingsClientDeps = {}) {
    this.client = new ServiceClientBase({
      dependency: 'bookings', baseUrl: config.bookingsBaseUrl, circuit: config.bookings,
      traceHeaderName: 'x-request-id', requestHeaderAllowlist: [],
    }, {
      serviceToken: { issue: (): Promise<string> => {
        const principal = this.principalStore.getStore();
        if (!principal) throw new GatewayDependencyError('bookings');
        return this.issueDelegatedToken(config, principal);
      } },
      ...(deps.fetch ? { fetch: deps.fetch } : {}), ...(deps.now ? { now: deps.now } : {}), ...(deps.sleep ? { sleep: deps.sleep } : {}),
    });
  }

  public request<T>(context: BookingsRequestContext, method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    return this.principalStore.run(context, async () => {
      let result: ServiceResult;
      try {
        result = await this.client.request({ method, path, traceId: context.traceId,
          ...(body === undefined ? {} : { body: new TextEncoder().encode(JSON.stringify(body)), contentType: 'application/json' }),
          ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
        });
      } catch (error) {
        if (error instanceof GatewayDependencyError) throw error;
        throw new GatewayDependencyError('bookings');
      }
      if (result.status >= 400) throw toRemoteHttpException(result);
      try { return JSON.parse(new TextDecoder().decode(result.body)) as T; }
      catch { throw new GatewayDependencyError('bookings'); }
    });
  }

  private async issueDelegatedToken(config: GatewayConfig, principal: BookingsRequestContext): Promise<string> {
    const key = await importPKCS8(config.serviceJwt.privateKey, 'RS256');
    return new SignJWT({ role: principal.role, scope: config.bookingsServiceJwt.scope })
      .setProtectedHeader({ alg: 'RS256', kid: config.serviceJwt.kid })
      .setIssuer(config.serviceJwt.issuer)
      .setAudience(config.bookingsServiceJwt.audience)
      .setSubject(principal.userId)
      .setIssuedAt()
      .setExpirationTime(`${config.serviceJwt.ttlSeconds}s`)
      .sign(key);
  }
}
