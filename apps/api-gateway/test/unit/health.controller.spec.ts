import { ServiceUnavailableException } from '@nestjs/common';

import type { GatewayRedisService } from '@gateway/infrastructure/cache/gateway-redis.service';
import type { GatewayConfig } from '@gateway/infrastructure/config/gateway-config';
import {
  HealthController,
  type HostResolver,
  type ReadinessResult,
  type TlsReader,
} from '@gateway/modules/health/health.controller';

import { createTestGatewayConfig } from '../support/gateway-config-fixture';

const { config } = createTestGatewayConfig();

function fakeRedis(result: boolean): { service: GatewayRedisService; pings: () => number } {
  let count = 0;
  const service = {
    ping: (): Promise<boolean> => {
      count += 1;
      return Promise.resolve(result);
    },
  } as unknown as GatewayRedisService;
  return { service, pings: (): number => count };
}

function fakeTls(result: boolean): { reader: TlsReader; calls: () => number } {
  let count = 0;
  return {
    reader: {
      readable: (): boolean => {
        count += 1;
        return result;
      },
    },
    calls: (): number => count,
  };
}

function fakeResolver(decide: (host: string) => boolean): {
  resolver: HostResolver;
  hosts: string[];
} {
  const hosts: string[] = [];
  return {
    resolver: {
      resolves: (host: string): Promise<boolean> => {
        hosts.push(host);
        return Promise.resolve(decide(host));
      },
    },
    hosts,
  };
}

function build(
  overrides: { redis?: boolean; tls?: boolean; resolves?: (host: string) => boolean } = {},
): {
  controller: HealthController;
  redisPings: () => number;
  tlsCalls: () => number;
  resolvedHosts: string[];
  cfg?: GatewayConfig;
} {
  const redis = fakeRedis(overrides.redis ?? true);
  const tls = fakeTls(overrides.tls ?? true);
  const resolver = fakeResolver(overrides.resolves ?? ((): boolean => true));
  const controller = new HealthController(config, redis.service, tls.reader, resolver.resolver);
  return {
    controller,
    redisPings: redis.pings,
    tlsCalls: tls.calls,
    resolvedHosts: resolver.hosts,
  };
}

async function readinessError(controller: HealthController): Promise<ServiceUnavailableException> {
  const error = await controller.ready().catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(ServiceUnavailableException);
  return error as ServiceUnavailableException;
}

describe('HealthController (GW-020)', () => {
  describe('/health/live', () => {
    it('responde vivo sin tocar ninguna dependencia', () => {
      const { controller, redisPings, tlsCalls, resolvedHosts } = build({
        redis: false,
        tls: false,
        resolves: (): boolean => false,
      });

      expect(controller.live()).toEqual({ status: 'live' });
      expect(redisPings()).toBe(0);
      expect(tlsCalls()).toBe(0);
      expect(resolvedHosts).toEqual([]);
    });
  });

  describe('/health/ready', () => {
    it('reporta listo cuando config, TLS, Redis y destinos responden', async () => {
      const { controller, resolvedHosts } = build();

      const result = await controller.ready();

      expect(result.status).toBe('ready');
      expect(result.checks).toEqual({ config: true, tls: true, redis: true, destinations: true });
      expect(resolvedHosts).toEqual(expect.arrayContaining(['auth-service', 'users-service']));
    });

    it('falla con 503 cuando Redis no esta disponible', async () => {
      const { controller } = build({ redis: false });

      const error = await readinessError(controller);
      const body = error.getResponse() as ReadinessResult;

      expect(error.getStatus()).toBe(503);
      expect(body.status).toBe('unavailable');
      expect(body.checks.redis).toBe(false);
      expect(body.checks.config).toBe(true);
    });

    it('falla con 503 cuando el material TLS no es legible', async () => {
      const { controller } = build({ tls: false });

      const body = (await readinessError(controller)).getResponse() as ReadinessResult;

      expect(body.checks.tls).toBe(false);
    });

    it('falla con 503 cuando un destino no resuelve', async () => {
      const { controller } = build({
        resolves: (host: string): boolean => host !== 'users-service',
      });

      const body = (await readinessError(controller)).getResponse() as ReadinessResult;

      expect(body.checks.destinations).toBe(false);
    });

    it('falla con 503 cuando falta configuracion esencial', async () => {
      const broken: GatewayConfig = { ...config, authBaseUrl: '' };
      const controller = new HealthController(
        broken,
        fakeRedis(true).service,
        fakeTls(true).reader,
        fakeResolver((): boolean => true).resolver,
      );

      const body = (await readinessError(controller)).getResponse() as ReadinessResult;

      expect(body.checks.config).toBe(false);
    });

    it('no expone secretos ni PII en el cuerpo de readiness', async () => {
      const { controller } = build();

      const result = await controller.ready();
      const serialized = JSON.stringify(result);

      expect(serialized).not.toContain(config.redis.url);
      expect(serialized).not.toContain(config.tls.certFile);
      expect(serialized).not.toContain('change-me');
    });
  });
});
