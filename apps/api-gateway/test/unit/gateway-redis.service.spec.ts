import Redis from 'ioredis';

import { GatewayRedisService } from '@gateway/infrastructure/cache/gateway-redis.service';

import { createTestGatewayConfig } from '../support/gateway-config-fixture';

jest.mock('ioredis', () => {
  const RedisMock = jest.fn();
  return { __esModule: true, default: RedisMock };
});

const RedisMock = Redis as unknown as jest.Mock;

function fakeClient(ping: jest.Mock = jest.fn().mockResolvedValue('PONG')): Record<string, unknown> {
  return {
    status: 'wait',
    connect: jest.fn().mockResolvedValue(undefined),
    ping,
    quit: jest.fn().mockResolvedValue('OK'),
    disconnect: jest.fn(),
  };
}

describe('GatewayRedisService (GW-014)', () => {
  const { config } = createTestGatewayConfig();

  beforeEach(() => {
    RedisMock.mockReset();
  });

  it('autentica contra Redis con la contraseña del secreto', () => {
    RedisMock.mockImplementation(() => fakeClient());

    new GatewayRedisService(config);

    expect(RedisMock).toHaveBeenCalledWith(
      config.redis.url,
      expect.objectContaining({
        password: config.redis.password,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      }),
    );
  });

  it('responde la sonda con PONG', async () => {
    const ping = jest.fn().mockResolvedValue('PONG');
    RedisMock.mockImplementation(() => fakeClient(ping));

    const service = new GatewayRedisService(config);

    await expect(service.ping()).resolves.toBe(true);
    expect(ping).toHaveBeenCalled();
  });
});
