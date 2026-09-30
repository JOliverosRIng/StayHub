import { toRemoteHttpException } from '@gateway/infrastructure/http/remote-problem.mapper';
import {
  ServiceClientBase,
  type HttpFetch,
  type ServiceClientDependencies,
  type ServiceResult,
  type ServiceTokenIssuer,
} from '@gateway/infrastructure/http/service-client.base';
import type { GatewayConfig } from '@gateway/infrastructure/config/gateway-config';

/**
 * GW-036 — Clientes del Gateway hacia Auth para el ciclo de sesión: login, refresh e
 * introspección de sesión.
 *
 * Se apoyan en el cliente base de GW-018 (`ServiceClientBase`): service JWT breve con
 * issuer/audience/scope propios del destino Auth, timeout y circuit breaker por `config.auth`,
 * allowlist de cabeceras y reintentos solo idempotentes. Como login/refresh/validate son POST sin
 * `Idempotency-Key`, el base NO los reintenta: login no duplica sesiones y un refresh reusado no
 * se repite (su reutilización obliga a un nuevo login, decisión que toma Auth). Se propaga el
 * `traceId`. Los errores remotos se traducen a Problem Details con GW-019 (`toRemoteHttpException`),
 * preservando 200/400/401/429/503. No se duplica lógica de transporte ni de mapeo.
 *
 * Alineado con los contratos internos de Auth congelados por el Grupo 3
 * (`contracts/openapi-auth-service.yaml`: `LoginCommand` → `InternalTokenPair`, refresh y validate).
 * Queda listo para la integración real de GW-058.
 */

const LOGIN_PATH = '/internal/v1/login';
const REFRESH_PATH = '/internal/v1/sessions/refresh';
const VALIDATE_PATH = '/internal/v1/sessions/validate';
const AUTH_DEPENDENCY = 'auth';

export interface LoginCredentials {
  readonly email: string;
  readonly password: string;
}

export interface SessionContext {
  readonly traceId: string;
}

export interface SessionPrincipal {
  readonly userId: string;
  readonly sessionId: string;
  readonly role: string;
}

export interface InternalTokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
  readonly absoluteExpiresAt: string;
  readonly principal: SessionPrincipal;
}

export interface AuthoritativeSession {
  readonly active: boolean;
  readonly role: string;
}

export interface AuthSessionClientDeps {
  readonly fetch?: HttpFetch;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export class AuthSessionClient {
  private readonly base: ServiceClientBase;

  public constructor(
    config: GatewayConfig,
    serviceToken: ServiceTokenIssuer,
    deps: AuthSessionClientDeps = {},
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

  /** Autentica credenciales y obtiene el par access/refresh (el refresh se moverá a la cookie). */
  public async login(
    credentials: LoginCredentials,
    context: SessionContext,
  ): Promise<InternalTokenPair> {
    const result = await this.send(LOGIN_PATH, context.traceId, {
      email: credentials.email,
      password: credentials.password,
    });
    return this.parsed<InternalTokenPair>(result);
  }

  /** Rota el refresh token; Auth revoca la familia si detecta reutilización. */
  public async refresh(refreshToken: string, context: SessionContext): Promise<InternalTokenPair> {
    const result = await this.send(REFRESH_PATH, context.traceId, { refreshToken });
    return this.parsed<InternalTokenPair>(result);
  }

  /** Valida `sid`/`sub` en Auth y devuelve el rol autoritativo de la sesión. */
  public async introspect(
    session: { readonly userId: string; readonly sessionId: string },
    context: SessionContext,
  ): Promise<AuthoritativeSession> {
    const result = await this.send(VALIDATE_PATH, context.traceId, {
      sessionId: session.sessionId,
      userId: session.userId,
    });
    return this.parsed<AuthoritativeSession>(result);
  }

  private send(
    path: string,
    traceId: string,
    payload: Record<string, unknown>,
  ): Promise<ServiceResult> {
    return this.base.request({
      method: 'POST',
      path,
      traceId,
      body: new TextEncoder().encode(JSON.stringify(payload)),
      contentType: 'application/json',
    });
  }

  private parsed<T>(result: ServiceResult): T {
    if (result.status >= 400) {
      throw toRemoteHttpException(result);
    }
    return JSON.parse(new TextDecoder().decode(result.body)) as T;
  }
}
