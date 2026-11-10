import { AsyncLocalStorage } from 'node:async_hooks';

import { GatewayDependencyError } from '@gateway/application/errors/gateway-errors';
import type { GatewayConfig } from '@gateway/infrastructure/config/gateway-config';
import { toRemoteHttpException } from '@gateway/infrastructure/http/remote-problem.mapper';
import {
  ServiceClientBase,
  type HttpFetch,
  type ServiceResult,
  type ServiceTokenIssuer,
} from '@gateway/infrastructure/http/service-client.base';

const REVIEWS_DEPENDENCY = 'reviews';

export interface ReviewsRequestContext {
  readonly traceId: string;
  readonly bearer: string;
}

export interface CreateReviewInput {
  readonly bookingId: string;
  readonly rating: number;
  readonly comment: string;
}

export interface ReviewView {
  readonly id: string;
  readonly propertyId: string;
  readonly rating: number;
  readonly comment: string;
  readonly createdAt: string;
}

export interface ReviewPage {
  readonly items: readonly ReviewView[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
}

export interface ReviewsClientDeps {
  readonly fetch?: HttpFetch;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

/** Adaptador REST Gateway -> Reviews. No contiene reglas de negocio de reseñas. */
export class ReviewsClient {
  private readonly serviceBase: ServiceClientBase;
  private readonly userBase: ServiceClientBase;
  private readonly bearerStore = new AsyncLocalStorage<string>();

  public constructor(
    config: GatewayConfig,
    serviceToken: ServiceTokenIssuer,
    deps: ReviewsClientDeps = {},
  ) {
    const common = {
      dependency: REVIEWS_DEPENDENCY,
      baseUrl: config.reviewsBaseUrl,
      circuit: config.reviews,
      traceHeaderName: 'x-request-id' as const,
    };
    const dependencies = {
      ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
      ...(deps.now === undefined ? {} : { now: deps.now }),
      ...(deps.sleep === undefined ? {} : { sleep: deps.sleep }),
    };
    this.serviceBase = new ServiceClientBase(common, { serviceToken, ...dependencies });
    this.userBase = new ServiceClientBase(common, {
      serviceToken: {
        issue: (): Promise<string> => {
          const bearer = this.bearerStore.getStore();
          if (bearer === undefined) throw new GatewayDependencyError(REVIEWS_DEPENDENCY);
          return Promise.resolve(bearer);
        },
      },
      ...dependencies,
    });
  }

  public create(input: CreateReviewInput, context: ReviewsRequestContext): Promise<ReviewView> {
    return this.withUserBearer(context, () =>
      this.callJson<ReviewView>(this.userBase, {
        method: 'POST',
        path: '/internal/v1/reviews',
        traceId: context.traceId,
        body: new TextEncoder().encode(JSON.stringify(input)),
        contentType: 'application/json',
      }),
    );
  }

  public listProperty(
    propertyId: string,
    query: string,
    traceId: string,
  ): Promise<ReviewPage> {
    return this.callJson<ReviewPage>(this.serviceBase, {
      method: 'GET',
      path: `/internal/v1/properties/${encodeURIComponent(propertyId)}/reviews${query}`,
      traceId,
    });
  }

  public listOwn(
    userId: string,
    query: string,
    context: ReviewsRequestContext,
  ): Promise<ReviewPage> {
    return this.withUserBearer(context, () =>
      this.callJson<ReviewPage>(this.userBase, {
        method: 'GET',
        path: `/internal/v1/reviews/user/${encodeURIComponent(userId)}${query}`,
        traceId: context.traceId,
      }),
    );
  }

  private withUserBearer<T>(context: ReviewsRequestContext, action: () => Promise<T>): Promise<T> {
    return this.bearerStore.run(context.bearer, action);
  }

  private async callJson<T>(
    client: ServiceClientBase,
    call: Parameters<ServiceClientBase['request']>[0],
  ): Promise<T> {
    let result: ServiceResult;
    try {
      result = await client.request(call);
    } catch (error) {
      if (error instanceof GatewayDependencyError) throw error;
      throw new GatewayDependencyError(REVIEWS_DEPENDENCY);
    }
    if (result.status >= 400) throw toRemoteHttpException(result);
    try {
      return JSON.parse(new TextDecoder().decode(result.body)) as T;
    } catch {
      throw new GatewayDependencyError(REVIEWS_DEPENDENCY);
    }
  }
}
