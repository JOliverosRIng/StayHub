import type { LoggerService } from '@nestjs/common';

import { GatewayDependencyError } from '@gateway/application/errors/gateway-errors';
import type { CircuitPolicy } from '@gateway/infrastructure/config/gateway-config';
import { STRIPPED_REQUEST_HEADERS } from '@gateway/interfaces/http/security/identity-header.interceptor';

/**
 * GW-018 — Cliente REST base para llamadas salientes del Gateway hacia Auth y Users.
 *
 * Responsabilidades transversales (Plan §6, Constitución IV/V):
 * - Autenticacion de servicio: adjunta un service JWT breve emitido por {@link ServiceTokenIssuer}.
 * - Correlacion: propaga el `traceId` en `x-trace-id`.
 * - Resiliencia: aplica timeout por intento y un circuit breaker por destino.
 * - Reintentos seguros: solo repite metodos idempotentes o peticiones con `Idempotency-Key`.
 * - Allowlist de cabeceras: nunca reenvia identidad ni cabeceras internas aportadas por el cliente.
 *
 * No traduce errores remotos a Problem Details; eso corresponde a GW-019.
 */

export type IdempotentHttpMethod = 'GET' | 'HEAD' | 'PUT' | 'DELETE' | 'OPTIONS';
export type HttpMethod = IdempotentHttpMethod | 'POST' | 'PATCH';

export const IDEMPOTENT_METHODS: ReadonlySet<HttpMethod> = new Set<HttpMethod>([
  'GET',
  'HEAD',
  'PUT',
  'DELETE',
  'OPTIONS',
]);

/** Emisor de service JWT; satisfecho estructuralmente por `ServiceTokenProvider` (GW-015). */
export interface ServiceTokenIssuer {
  issue(): Promise<string>;
}

/** Puerto HTTP compatible con `fetch` global; inyectable para pruebas deterministas. */
export type HttpFetch = typeof fetch;

export interface ServiceClientOptions {
  /** Identificador del destino usado en errores y logs, p. ej. `auth` o `users`. */
  readonly dependency: string;
  /** URL base del servicio interno, sin sufijo de ruta. */
  readonly baseUrl: string;
  /** Politica de timeout y circuit breaker del destino. */
  readonly circuit: CircuitPolicy;
  /** Cabeceras del cliente que pueden reenviarse; el resto se descarta. */
  readonly requestHeaderAllowlist?: readonly string[];
  /** Cabeceras de respuesta que se exponen al llamador; el resto se descarta. */
  readonly responseHeaderAllowlist?: readonly string[];
  /** Reintentos adicionales para operaciones reintentables (por defecto 2). */
  readonly maxRetries?: number;
}

export interface ServiceClientDependencies {
  readonly serviceToken: ServiceTokenIssuer;
  readonly fetch?: HttpFetch;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly logger?: LoggerService;
}

export interface ServiceCall {
  readonly method: HttpMethod;
  /** Ruta relativa a `baseUrl`, p. ej. `/internal/v1/registrations`. */
  readonly path: string;
  readonly traceId: string;
  /** Cabeceras aportadas por el llamador; se filtran contra la allowlist. */
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: Uint8Array;
  readonly contentType?: string;
  readonly idempotencyKey?: string;
}

export interface ServiceResult {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Uint8Array;
}

const DEFAULT_MAX_RETRIES = 2;

const DEFAULT_RESPONSE_HEADER_ALLOWLIST: readonly string[] = [
  'content-type',
  'content-length',
  'retry-after',
  'location',
  'idempotency-key',
  'www-authenticate',
];

/** Cabeceras que el cliente controla siempre y que jamas se toman del llamador. */
const RESERVED_REQUEST_HEADERS: ReadonlySet<string> = new Set<string>([
  ...STRIPPED_REQUEST_HEADERS,
  'authorization',
  'x-trace-id',
  'content-type',
  'content-length',
  'idempotency-key',
  'host',
]);

export class ServiceClientBase {
  private readonly serviceToken: ServiceTokenIssuer;
  private readonly fetch: HttpFetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly logger: LoggerService | undefined;
  private readonly maxRetries: number;
  private readonly requestAllowlist: ReadonlySet<string>;
  private readonly responseAllowlist: ReadonlySet<string>;

  private failureCount = 0;
  private openUntil = 0;

  public constructor(
    protected readonly options: ServiceClientOptions,
    dependencies: ServiceClientDependencies,
  ) {
    this.serviceToken = dependencies.serviceToken;
    this.fetch = dependencies.fetch ?? fetch;
    this.now = dependencies.now ?? ((): number => Date.now());
    this.sleep = dependencies.sleep ?? defaultSleep;
    this.logger = dependencies.logger;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.requestAllowlist = new Set(
      (options.requestHeaderAllowlist ?? []).map((name) => name.toLowerCase()),
    );
    this.responseAllowlist = new Set(
      (options.responseHeaderAllowlist ?? DEFAULT_RESPONSE_HEADER_ALLOWLIST).map((name) =>
        name.toLowerCase(),
      ),
    );
  }

  public async request(call: ServiceCall): Promise<ServiceResult> {
    const retryable = this.isRetryable(call);
    const attempts = retryable ? this.maxRetries + 1 : 1;
    const url = this.resolveUrl(call.path);

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      this.ensureCircuitClosed();
      const isLast = attempt === attempts - 1;

      let response: Response;
      try {
        response = await this.dispatch(url, call);
      } catch {
        this.recordFailure();
        if (isLast) throw new GatewayDependencyError(this.options.dependency);
        await this.backoff(attempt);
        continue;
      }

      if (response.status >= 500) {
        this.recordFailure();
        if (!isLast) {
          await this.backoff(attempt);
          continue;
        }
        return this.buildResult(response);
      }

      this.recordSuccess();
      return this.buildResult(response);
    }

    // Inalcanzable: el bucle siempre retorna o lanza en el ultimo intento.
    throw new GatewayDependencyError(this.options.dependency);
  }

  private isRetryable(call: ServiceCall): boolean {
    return IDEMPOTENT_METHODS.has(call.method) || call.idempotencyKey !== undefined;
  }

  private async dispatch(url: string, call: ServiceCall): Promise<Response> {
    const headers = await this.buildHeaders(call);
    const init: RequestInit = {
      method: call.method,
      headers,
      signal: AbortSignal.timeout(this.options.circuit.timeoutMs),
    };
    if (call.body !== undefined) init.body = call.body;
    return this.fetch(url, init);
  }

  private async buildHeaders(call: ServiceCall): Promise<Record<string, string>> {
    const token = await this.serviceToken.issue();
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      'x-trace-id': call.traceId,
      accept: 'application/json',
    };

    const provided = lowercaseHeaders(call.headers);
    for (const name of this.requestAllowlist) {
      if (RESERVED_REQUEST_HEADERS.has(name)) continue;
      const value = provided.get(name);
      if (value !== undefined) headers[name] = value;
    }

    if (call.body !== undefined) headers['content-type'] = call.contentType ?? 'application/json';
    if (call.idempotencyKey !== undefined) headers['idempotency-key'] = call.idempotencyKey;

    return headers;
  }

  private async buildResult(response: Response): Promise<ServiceResult> {
    const body = new Uint8Array(await response.arrayBuffer());
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      if (this.responseAllowlist.has(key.toLowerCase())) headers[key.toLowerCase()] = value;
    });
    return { status: response.status, headers, body };
  }

  private ensureCircuitClosed(): void {
    if (this.openUntil > 0 && this.now() < this.openUntil) {
      throw new GatewayDependencyError(this.options.dependency);
    }
  }

  private recordFailure(): void {
    this.failureCount += 1;
    if (this.failureCount >= this.options.circuit.failureThreshold) {
      this.openUntil = this.now() + this.options.circuit.resetMs;
      this.logger?.warn('service client circuit opened', {
        dependency: this.options.dependency,
        event: 'circuit_open',
      });
    }
  }

  private recordSuccess(): void {
    this.failureCount = 0;
    this.openUntil = 0;
  }

  private async backoff(attempt: number): Promise<void> {
    await this.sleep(50 * (attempt + 1));
  }

  private resolveUrl(path: string): string {
    return `${this.options.baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  }
}

function lowercaseHeaders(
  headers: Readonly<Record<string, string>> | undefined,
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  if (headers === undefined) return map;
  for (const [name, value] of Object.entries(headers)) {
    map.set(name.toLowerCase(), value);
  }
  return map;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
