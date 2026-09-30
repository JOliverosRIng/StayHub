import { Controller, Get, Inject, RequestMethod, ServiceUnavailableException } from '@nestjs/common';

import { GatewayRedisService } from '@gateway/infrastructure/cache/gateway-redis.service';
import {
  GATEWAY_CONFIG,
  type GatewayConfig,
  type TlsConfig,
} from '@gateway/infrastructure/config/gateway-config';

/**
 * GW-020 — Sondas operativas del Gateway.
 *
 * - `/health/live`: informa que el proceso está vivo; no consulta dependencias (Plan §7).
 * - `/health/ready`: exige configuración esencial, material TLS legible, Redis de borde
 *   disponible (GW-014) y destinos Auth/Users resolubles; falla cerrado con 503 si algo falta.
 *
 * Ambas rutas viven en la raíz, fuera del prefijo `/api/v1`; la exclusión la aplica el
 * bootstrap (GW-010) reutilizando {@link HEALTH_PREFIX_EXCLUDE}.
 */

export const HEALTH_ROUTE = 'health';
export const LIVENESS_PATH = 'live';
export const READINESS_PATH = 'ready';

/** Descriptor de ruta compatible con `RouteInfo` de NestJS para `setGlobalPrefix`. */
export interface HealthRouteExclusion {
  readonly path: string;
  readonly method: RequestMethod;
}

/** Rutas de salud excluidas del prefijo global `/api/v1`. */
export const HEALTH_PREFIX_EXCLUDE: readonly HealthRouteExclusion[] = [
  { path: `${HEALTH_ROUTE}/${LIVENESS_PATH}`, method: RequestMethod.GET },
  { path: `${HEALTH_ROUTE}/${READINESS_PATH}`, method: RequestMethod.GET },
];

export const HEALTH_TLS_READER = Symbol('HEALTH_TLS_READER');
export const HEALTH_HOST_RESOLVER = Symbol('HEALTH_HOST_RESOLVER');

/** Verifica que el certificado y la clave TLS configurados sean legibles. */
export interface TlsReader {
  readable(tls: TlsConfig): boolean;
}

/** Verifica que un host de destino resuelva (sin llamar a Auth ni a Users). */
export interface HostResolver {
  resolves(host: string): Promise<boolean>;
}

export interface ReadinessChecks {
  readonly config: boolean;
  readonly tls: boolean;
  readonly redis: boolean;
  readonly destinations: boolean;
}

export interface ReadinessResult {
  readonly status: 'ready' | 'unavailable';
  readonly checks: ReadinessChecks;
}

export interface LivenessResult {
  readonly status: 'live';
}

@Controller(HEALTH_ROUTE)
export class HealthController {
  public constructor(
    @Inject(GATEWAY_CONFIG) private readonly config: GatewayConfig,
    private readonly redis: GatewayRedisService,
    @Inject(HEALTH_TLS_READER) private readonly tlsReader: TlsReader,
    @Inject(HEALTH_HOST_RESOLVER) private readonly resolver: HostResolver,
  ) {}

  @Get(LIVENESS_PATH)
  public live(): LivenessResult {
    return { status: 'live' };
  }

  @Get(READINESS_PATH)
  public async ready(): Promise<ReadinessResult> {
    const config = this.hasEssentialConfig();
    const [redis, destinations] = await Promise.all([
      this.redis.ping(),
      this.destinationsResolvable(),
    ]);
    const tls = config && this.tlsReader.readable(this.config.tls);

    const checks: ReadinessChecks = { config, tls, redis, destinations };
    const result: ReadinessResult = {
      status: config && tls && redis && destinations ? 'ready' : 'unavailable',
      checks,
    };

    if (result.status === 'unavailable') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }

  private hasEssentialConfig(): boolean {
    const { tls, authBaseUrl, usersBaseUrl, redis } = this.config;
    return (
      nonEmpty(tls.certFile) &&
      nonEmpty(tls.keyFile) &&
      nonEmpty(authBaseUrl) &&
      nonEmpty(usersBaseUrl) &&
      nonEmpty(redis.url)
    );
  }

  private async destinationsResolvable(): Promise<boolean> {
    const hosts = [hostOf(this.config.authBaseUrl), hostOf(this.config.usersBaseUrl)];
    if (hosts.some((host) => host === undefined)) return false;
    const resolved = await Promise.all(
      hosts.map((host) => this.resolver.resolves(host as string)),
    );
    return resolved.every((value) => value);
  }
}

function nonEmpty(value: string): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}
