import { Test } from '@nestjs/testing';

import { GatewayRedisModule } from '@gateway/infrastructure/cache/gateway-redis.module';
import { GatewayRedisService } from '@gateway/infrastructure/cache/gateway-redis.service';
import { RateLimitStore } from '@gateway/infrastructure/cache/rate-limit.store';

import { createTestGatewayConfig } from '../support/gateway-config-fixture';

describe('GatewayRedisModule (GW-014)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('expone el store de rate limit y el cliente Redis', async () => {
    const { env } = createTestGatewayConfig();
    Object.assign(process.env, env);

    const moduleRef = await Test.createTestingModule({
      imports: [GatewayRedisModule],
    }).compile();

    expect(moduleRef.get(RateLimitStore)).toBeInstanceOf(RateLimitStore);
    expect(moduleRef.get(GatewayRedisService)).toBeInstanceOf(GatewayRedisService);

    await moduleRef.close();
  });

  it('propaga el fallo de conexion en vez de conceder trafico', async () => {
    const { env } = createTestGatewayConfig({
      GATEWAY_REDIS_URL: 'redis://127.0.0.1:56399',
    });
    Object.assign(process.env, env);

    const moduleRef = await Test.createTestingModule({
      imports: [GatewayRedisModule],
    }).compile();
    const service = moduleRef.get(GatewayRedisService);

    await expect(service.ping()).resolves.toBe(false);
    await expect(service.eval('return 1', 0)).rejects.toBeDefined();

    await moduleRef.close();
  });
});
