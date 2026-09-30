import { HttpException } from '@nestjs/common';
import type { Request } from 'express';

import { GatewayDependencyError } from '@gateway/application/errors/gateway-errors';
import { RateLimitStore, type RedisScriptPort } from '@gateway/infrastructure/cache/rate-limit.store';
import type { GatewayConfig } from '@gateway/infrastructure/config/gateway-config';
import { TrustedOriginService } from '@gateway/infrastructure/security/trusted-origin.service';

import { createTestGatewayConfig } from '../support/gateway-config-fixture';

/**
 * GW-024 — Pruebas del límite de registro (ventana rodante 10/origen/10 min).
 *
 * Test-first: el servicio `RegistrationRateLimitService` se implementa en GW-027, por lo que
 * este spec DEBE quedar en rojo. El servicio se carga por import dinámico con un especificador
 * variable, de modo que TypeScript/ESLint permanecen verdes y el fallo ocurre en tiempo de
 * ejecución con "Cannot find module …/registration-rate-limit.service" — es decir, por lógica
 * ausente, no por configuración del harness. Cuando GW-027 exista, estas pruebas lo ejercitarán.
 *
 * Reutiliza GW-013 (`TrustedOriginService`) para el origen y GW-014 (`RateLimitStore` sobre el
 * Redis de borde) para el conteo; aquí el Redis se sustituye por un doble en memoria con reloj
 * controlable que reproduce el script atómico INCR/PEXPIRE/PTTL de GW-014.
 */

const LIMIT = 10;
const WINDOW_MS = 600_000; // 10 minutos, según el default del plan §3.
const SERVICE_MODULE = '../../src/modules/rate-limit/registration-rate-limit.service';

/** Contrato esperado del servicio GW-027 que definen estas pruebas. */
interface RegistrationRateLimiter {
  enforce(request: Request): Promise<void>;
}

type RegistrationRateLimiterCtor = new (
  trustedOrigin: TrustedOriginService,
  store: RateLimitStore,
) => RegistrationRateLimiter;

interface RateLimitedResponse {
  readonly code?: string;
  readonly retryAfter?: number;
}

async function loadRegistrationRateLimiter(): Promise<RegistrationRateLimiterCtor> {
  const specifier: string = SERVICE_MODULE;
  const module = (await import(specifier)) as {
    RegistrationRateLimitService?: RegistrationRateLimiterCtor;
  };
  if (module.RegistrationRateLimitService === undefined) {
    throw new Error('GW-027 pendiente: RegistrationRateLimitService no exporta la clase esperada');
  }
  return module.RegistrationRateLimitService;
}

/** Doble en memoria del Redis de borde: emula INCR + PEXPIRE + PTTL con expiración por reloj. */
class FakeEdgeRedis implements RedisScriptPort {
  private readonly entries = new Map<string, { count: number; expiresAt: number }>();

  public constructor(private readonly now: () => number) {}

  public eval(_script: string, _numKeys: number, ...args: (string | number)[]): Promise<unknown> {
    const key = String(args[0]);
    const windowMs = Number(args[1]);
    const current = this.now();

    const existing = this.entries.get(key);
    if (existing !== undefined && existing.expiresAt <= current) {
      this.entries.delete(key);
    }

    const entry = this.entries.get(key);
    if (entry === undefined) {
      this.entries.set(key, { count: 1, expiresAt: current + windowMs });
      return Promise.resolve([1, windowMs]);
    }

    entry.count += 1;
    let ttl = entry.expiresAt - current;
    if (ttl < 0) {
      entry.expiresAt = current + windowMs;
      ttl = windowMs;
    }
    return Promise.resolve([entry.count, ttl]);
  }

  public keys(): string[] {
    return [...this.entries.keys()];
  }
}

function requestFrom(socketAddress: string, forwardedFor?: string): Request {
  return {
    socket: { remoteAddress: socketAddress },
    headers: forwardedFor === undefined ? {} : { 'x-forwarded-for': forwardedFor },
  } as unknown as Request;
}

interface Harness {
  readonly service: RegistrationRateLimiter;
  readonly redis: FakeEdgeRedis;
  readonly config: GatewayConfig;
}

async function build(now: () => number, redisOverride?: RedisScriptPort): Promise<Harness> {
  const { config } = createTestGatewayConfig();
  const redis = new FakeEdgeRedis(now);
  const store = new RateLimitStore(config, redisOverride ?? redis);
  const trustedOrigin = new TrustedOriginService(config.trustedProxyCidrs);
  const Service = await loadRegistrationRateLimiter();
  return { service: new Service(trustedOrigin, store), redis, config };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('se esperaba un rechazo, pero la promesa resolvió');
    },
    (error: unknown) => error,
  );
}

describe('Límite de registro por origen (GW-024)', () => {
  it('permite exactamente 10 solicitudes del mismo origen dentro de la ventana', async () => {
    const { service } = await build(() => 0);
    const request = requestFrom('198.51.100.7');

    for (let attempt = 1; attempt <= LIMIT; attempt += 1) {
      await expect(service.enforce(request)).resolves.toBeUndefined();
    }
  });

  it('rechaza con 429 la solicitud número 11 del mismo origen', async () => {
    const { service } = await build(() => 0);
    const request = requestFrom('198.51.100.7');

    for (let attempt = 1; attempt <= LIMIT; attempt += 1) {
      await service.enforce(request);
    }

    const error = await rejection(service.enforce(request));
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
  });

  it('expone Retry-After con el valor exacto de la ventana restante', async () => {
    let now = 0;
    const { service } = await build(() => now);
    const request = requestFrom('198.51.100.7');

    for (let attempt = 1; attempt <= LIMIT; attempt += 1) {
      await service.enforce(request);
    }

    // Sin tiempo transcurrido: queda toda la ventana (600 s).
    const atStart = (await rejection(service.enforce(request))) as HttpException;
    expect((atStart.getResponse() as RateLimitedResponse).retryAfter).toBe(600);

    // Tras 100 s la ventana rodante conserva su vencimiento original: 500 s restantes.
    now = 100_000;
    const later = (await rejection(service.enforce(request))) as HttpException;
    expect((later.getResponse() as RateLimitedResponse).retryAfter).toBe(500);
  });

  it('recupera la ventana automáticamente cuando vence', async () => {
    let now = 0;
    const { service } = await build(() => now);
    const request = requestFrom('198.51.100.7');

    for (let attempt = 1; attempt <= LIMIT; attempt += 1) {
      await service.enforce(request);
    }
    await expect(rejection(service.enforce(request))).resolves.toBeInstanceOf(HttpException);

    now = WINDOW_MS + 1;
    await expect(service.enforce(request)).resolves.toBeUndefined();
  });

  it('cuenta por origen resuelto según GW-013, con contadores independientes', async () => {
    const { service } = await build(() => 0);
    const origin = requestFrom('198.51.100.7');
    const otherOrigin = requestFrom('203.0.113.9');

    for (let attempt = 1; attempt <= LIMIT; attempt += 1) {
      await service.enforce(origin);
    }
    await expect(rejection(service.enforce(origin))).resolves.toBeInstanceOf(HttpException);

    // Un origen distinto no comparte el contador: sigue permitido.
    await expect(service.enforce(otherOrigin)).resolves.toBeUndefined();
  });

  it('usa la IP reenviada solo cuando el proxy inmediato es confiable (GW-013)', async () => {
    const { service } = await build(() => 0);
    // socket 10.0.0.1 es proxy confiable (10.0.0.0/8): el origen es la IP reenviada.
    const viaProxy = requestFrom('10.0.0.1', '198.51.100.7');
    const otherClientSameProxy = requestFrom('10.0.0.1', '198.51.100.8');

    for (let attempt = 1; attempt <= LIMIT; attempt += 1) {
      await service.enforce(viaProxy);
    }
    await expect(rejection(service.enforce(viaProxy))).resolves.toBeInstanceOf(HttpException);

    // Otro cliente reenviado por el mismo proxy tiene su propio contador.
    await expect(service.enforce(otherClientSameProxy)).resolves.toBeUndefined();
  });

  it('almacena el contador en el Redis de borde de GW-014 bajo el namespace y scope de registro', async () => {
    const { service, redis, config } = await build(() => 0);

    await service.enforce(requestFrom('198.51.100.7'));

    expect(redis.keys()).toContain(`${config.redis.namespace}:register:198.51.100.7`);
  });

  it('falla cerrado propagando GatewayDependencyError cuando el Redis de borde no responde', async () => {
    const brokenRedis: RedisScriptPort = {
      eval: (): Promise<unknown> => Promise.reject(new Error('redis down')),
    };
    const { service } = await build(() => 0, brokenRedis);

    const error = await rejection(service.enforce(requestFrom('198.51.100.7')));
    expect(error).toBeInstanceOf(GatewayDependencyError);
  });
});
