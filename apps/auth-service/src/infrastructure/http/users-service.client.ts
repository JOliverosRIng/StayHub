import { Inject, Injectable } from '@nestjs/common';

import { AUTH_CONFIG, type AuthConfig } from '@auth/infrastructure/config/auth-config';
import { UsersServiceTokenProvider } from '@auth/infrastructure/security/users-service-token.provider';
import {
  type UsersServiceProblem,
  type UsersServiceRequest,
  UsersServiceHttpError,
} from './users-service.types';

@Injectable()
export class UsersServiceClient {
  private consecutiveFailures = 0;
  private circuitOpenUntil = 0;

  public constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    private readonly tokens: UsersServiceTokenProvider,
  ) {}

  public async request<TResponse, TBody = never>(
    request: UsersServiceRequest<TBody>,
  ): Promise<TResponse> {
    if (Date.now() < this.circuitOpenUntil) throw new Error('Users service circuit is open');
    const attempts = request.idempotent ? 2 : 1;
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const result = await this.execute<TResponse, TBody>(request);
        this.consecutiveFailures = 0;
        return result;
      } catch (error) {
        lastError = error;
        if (error instanceof UsersServiceHttpError && error.status < 500) throw error;
      }
    }
    this.recordFailure();
    throw lastError instanceof Error ? lastError : new Error('Users service request failed');
  }

  private async execute<TResponse, TBody>(request: UsersServiceRequest<TBody>): Promise<TResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.usersTimeoutMs);
    try {
      const token = await this.tokens.issue();
      const response = await fetch(new URL(request.path, this.config.usersServiceUrl), {
        method: request.method,
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'x-trace-id': request.traceId,
          ...(request.idempotencyKey === undefined
            ? {}
            : { 'idempotency-key': request.idempotencyKey }),
        },
        ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      });
      if (!response.ok) {
        const contentType = response.headers.get('content-type') ?? '';
        const problem = contentType.includes('application/problem+json')
          ? ((await response.json()) as UsersServiceProblem)
          : null;
        throw new UsersServiceHttpError(response.status, problem);
      }
      if (response.status === 204) return undefined as TResponse;
      return (await response.json()) as TResponse;
    } finally {
      clearTimeout(timeout);
    }
  }

  private recordFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.config.usersCircuitFailureThreshold) {
      this.circuitOpenUntil = Date.now() + this.config.usersCircuitResetMs;
      this.consecutiveFailures = 0;
    }
  }
}

