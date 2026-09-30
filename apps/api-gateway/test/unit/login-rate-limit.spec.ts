import { HttpException } from '@nestjs/common';
import type { Request } from 'express';

import { GatewayDependencyError } from '@gateway/application/errors/gateway-errors';
import { RateLimitStore, type RedisScriptPort } from '@gateway/infrastructure/cache/rate-limit.store';
import type { GatewayConfig } from '@gateway/infrastructure/config/gateway-config';
import { TrustedOriginService } from '@gateway/infrastructure/security/trusted-origin.service';

import { createTestGatewayConfig } from '../support/gateway-config-fixture';

/**
 * GW-032 — Pruebas del límite de login (ventana rodante 30/origen/5 min).
 *
 * Test-first: el servicio `LoginRateLimitService` se implementa en GW-035, por lo que este spec
 * DEBE quedar en rojo. El servicio se carga por import dinámico con especificador variable, de
 * modo que TypeScript/ESLint permanecen verdes y el fallo ocurre en tiempo de ejecución con
 * "Cannot find module …/login-rate-limit.service" — es decir, por lógica ausente, no por
 * configuración del harness. Cuando GW-035 exista, estas pruebas lo ejercitarán.
 *
 * Reutiliza GW-013 (`TrustedOriginService`) para el origen y GW-014 (`RateLimitStore` sobre el
 * Redis de borde, scope `login`) para el conteo; el Redis se sustituye por un doble en memoria
 * con reloj controlable que reproduce el script atómico INCR/PEXPIRE/PTTL de GW-014.
 */

const LIMIT = 30;
const WINDOW_MS = 300_000; // 5 minutos, según FR-007/FR-008 y el plan §3.
const SERVICE_MODULE = '../../src/modules/rate-limit/login-rate-limit.service';

interface LoginRateLimiter {
  enforce(request: Request): Promise<void>;
}

type LoginRateLimiterCtor = new (
  trustedOrigin: TrustedOriginService,
  store: RateLimitStore,
) => LoginRateLimiter;

interface RateLimitedResponse {
  readonly code?: string;
  readonly retryAfter?: number;
}

async function loadLoginRateLimiter(): Promise<LoginRateLimiterCtor> {
  const specifier: string = SERVICE_MODULE;
  const module = (await import(specifier)) as {
    LoginRateLimitService?: LoginRateLimiterCtor;
  };
  if (module.LoginRateLimitService === undefined) {
    throw new Error('GW-035 pendiente: LoginRateLimitService no exporta la clase esperada');
  }
  return module.LoginRateLimitService;
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
  readonly service: LoginRateLimiter;
  readonly redis: FakeEdgeRedis;
  readonly config: GatewayConfig;
}

async function build(now: () => number, redisOverride?: RedisScriptPort): Promise<Harness> {
  const { config } = createTestGatewayConfig();
  const redis = new FakeEdgeRedis(now);
  const store = new RateLimitStore(config, redisOverride ?? redis);
  const trustedOrigin = new TrustedOriginService(config.trustedProxyCidrs);
  const Service = await loadLoginRateLimiter();
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

describe('Límite de login por origen (GW-032)', () => {
  it('permite exactamente 30 intentos del mismo origen dentro de la ventana', async () => {
    const { service } = await build(() => 0);
    const request = requestFrom('198.51.100.7');

    for (let attempt = 1; attempt <= LIMIT; attempt += 1) {
      await expect(service.enforce(request)).resolves.toBeUndefined();
    }
  });

  it('rechaza con 429 el intento número 31 del mismo origen', async () => {
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

    const atStart = (await rejection(service.enforce(request))) as HttpException;
    expect((atStart.getResponse() as RateLimitedResponse).retryAfter).toBe(300);

    now = 60_000;
    const later = (await rejection(service.enforce(request))) as HttpException;
    expect((later.getResponse() as RateLimitedResponse).retryAfter).toBe(240);
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

    await expect(service.enforce(otherOrigin)).resolves.toBeUndefined();
  });

  it('usa la IP reenviada solo cuando el proxy inmediato es confiable (GW-013)', async () => {
    const { service } = await build(() => 0);
    const viaProxy = requestFrom('10.0.0.1', '198.51.100.7');
    const otherClientSameProxy = requestFrom('10.0.0.1', '198.51.100.8');

    for (let attempt = 1; attempt <= LIMIT; attempt += 1) {
      await service.enforce(viaProxy);
    }
    await expect(rejection(service.enforce(viaProxy))).resolves.toBeInstanceOf(HttpException);

    await expect(service.enforce(otherClientSameProxy)).resolves.toBeUndefined();
  });

  it('almacena el contador en el Redis de borde de GW-014 bajo el namespace y scope de login', async () => {
    const { service, redis, config } = await build(() => 0);

    await service.enforce(requestFrom('198.51.100.7'));

    expect(redis.keys()).toContain(`${config.redis.namespace}:login:198.51.100.7`);
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
