import { GatewayDependencyError } from '@gateway/application/errors/gateway-errors';
import type { GatewayConfig } from '@gateway/infrastructure/config/gateway-config';
import { toRemoteHttpException } from '@gateway/infrastructure/http/remote-problem.mapper';
import {
  ServiceClientBase,
  type HttpFetch,
  type ServiceResult,
  type ServiceTokenIssuer,
} from '@gateway/infrastructure/http/service-client.base';

/**
 * Cliente del Gateway hacia Search (RQ-04). Search solo acepta service JWT
 * (audience `stayhub-search-service`, scope `search:invoke`); la búsqueda es pública en el
 * Gateway, así que nunca se reenvía el bearer del usuario.
 */

const SEARCH_DEPENDENCY = 'search';

export interface SearchClientDeps {
  readonly fetch?: HttpFetch;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export class SearchClient {
  private readonly base: ServiceClientBase;

  public constructor(config: GatewayConfig, serviceToken: ServiceTokenIssuer, deps: SearchClientDeps = {}) {
    this.base = new ServiceClientBase(
      { dependency: SEARCH_DEPENDENCY, baseUrl: config.searchBaseUrl, circuit: config.search },
      {
        serviceToken,
        ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
        ...(deps.now === undefined ? {} : { now: deps.now }),
        ...(deps.sleep === undefined ? {} : { sleep: deps.sleep }),
      },
    );
  }

  public search(query: string, traceId: string): Promise<unknown> {
    return this.get(`/internal/v1/search${query}`, traceId);
  }

  public suggest(query: string, traceId: string): Promise<unknown> {
    return this.get(`/internal/v1/search/suggest${query}`, traceId);
  }

  private async get(path: string, traceId: string): Promise<unknown> {
    let result: ServiceResult;
    try {
      result = await this.base.request({ method: 'GET', path, traceId });
    } catch (error) {
      if (error instanceof GatewayDependencyError) throw error;
      throw new GatewayDependencyError(SEARCH_DEPENDENCY);
    }
    if (result.status >= 400) throw toRemoteHttpException(result);
    try {
      return JSON.parse(new TextDecoder().decode(result.body)) as unknown;
    } catch {
      throw new GatewayDependencyError(SEARCH_DEPENDENCY);
    }
  }
}
