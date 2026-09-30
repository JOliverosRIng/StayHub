import { toRemoteHttpException } from '@gateway/infrastructure/http/remote-problem.mapper';
import {
  ServiceClientBase,
  type HttpFetch,
  type ServiceClientDependencies,
  type ServiceTokenIssuer,
} from '@gateway/infrastructure/http/service-client.base';
import type { GatewayConfig } from '@gateway/infrastructure/config/gateway-config';

/**
 * GW-028 — Cliente del Gateway hacia Auth para `POST /internal/v1/registrations`.
 *
 * Se apoya en el cliente base de GW-018 (`ServiceClientBase`): service JWT breve con
 * issuer/audience/scope propios del destino Auth, timeout y circuit breaker por `config.auth`,
 * allowlist de cabeceras y reintentos solo idempotentes; el registro viaja con `Idempotency-Key`,
 * de modo que un reintento es seguro. Propaga el `traceId`. Los errores remotos se traducen a
 * Problem Details con GW-019 (`toRemoteHttpException`), preservando 201/400/409/429/503. No se
 * duplica lógica de transporte ni de mapeo.
 *
 * Alineado con el contrato interno de Auth congelado por el Grupo 3
 * (`contracts/openapi-auth-service.yaml`, `RegisterCommand` → `UserSummary`). Queda listo para la
 * integración real de GW-058.
 */

const INTERNAL_REGISTRATIONS_PATH = '/internal/v1/registrations';
const AUTH_DEPENDENCY = 'auth';

export interface RegisterInput {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly role: 'GUEST' | 'OWNER';
}

export interface RegisterContext {
  readonly traceId: string;
  readonly idempotencyKey: string;
}

export interface UserSummary {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: string;
}

export interface AuthRegistrationClientDeps {
  readonly fetch?: HttpFetch;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export class AuthRegistrationClient {
  private readonly base: ServiceClientBase;

  public constructor(
    config: GatewayConfig,
    serviceToken: ServiceTokenIssuer,
    deps: AuthRegistrationClientDeps = {},
  ) {
    const dependencies: ServiceClientDependencies = {
      serviceToken,
      ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
      ...(deps.now === undefined ? {} : { now: deps.now }),
      ...(deps.sleep === undefined ? {} : { sleep: deps.sleep }),
    };
    this.base = new ServiceClientBase(
      { dependency: AUTH_DEPENDENCY, baseUrl: config.authBaseUrl, circuit: config.auth },
      dependencies,
    );
  }

  public async register(input: RegisterInput, context: RegisterContext): Promise<UserSummary> {
    const result = await this.base.request({
      method: 'POST',
      path: INTERNAL_REGISTRATIONS_PATH,
      traceId: context.traceId,
      idempotencyKey: context.idempotencyKey,
      body: new TextEncoder().encode(
        JSON.stringify({
          name: input.name,
          email: input.email,
          password: input.password,
          role: input.role,
        }),
      ),
      contentType: 'application/json',
    });

    if (result.status >= 400) {
      throw toRemoteHttpException(result);
    }
    return parseUserSummary(result.body);
  }
}

function parseUserSummary(body: Uint8Array): UserSummary {
  return JSON.parse(new TextDecoder().decode(body)) as UserSummary;
}
