import Redis from 'ioredis';

import { GatewayDependencyError } from '@gateway/application/errors/gateway-errors';
import { RateLimitStore, type RedisScriptPort } from '@gateway/infrastructure/cache/rate-limit.store';
import type { GatewayConfig } from '@gateway/infrastructure/config/gateway-config';

import { createTestGatewayConfig } from '../support/gateway-config-fixture';

const REDIS_URL = process.env['GATEWAY_TEST_REDIS_URL'] ?? 'redis://127.0.0.1:56380';
const suite = process.env['GATEWAY_TEST_REDIS_URL'] === undefined ? describe.skip : describe;

class IoredisScriptAdapter implements RedisScriptPort {
  public constructor(private readonly redis: Redis) {}

  public eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown> {
    return this.redis.eval(script, numKeys, ...args);
  }
}

suite('RateLimitStore sobre Redis real (GW-014)', () => {
  const { config } = createTestGatewayConfig();
  let redis: Redis;

  beforeAll(() => {
    redis = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  });

  afterEach(async () => {
    const keys = await redis.keys('gateway:edge:*');
    if (keys.length > 0) await redis.del(...keys);
  });

  afterAll(async () => {
    await redis.quit();
  });

  const build = (override: GatewayConfig = config): {
    store: RateLimitStore;
    client: Redis;
  } => {
    const client = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    return { store: new RateLimitStore(override, new IoredisScriptAdapter(client)), client };
  };

  it('concede exactamente el limite bajo peticiones concurrentes', async () => {
    const { store } = build();

    const decisions = await Promise.all(
      Array.from({ length: 50 }, () => store.consume('register', '198.51.100.7')),
    );

    const allowed = decisions.filter((decision) => decision.allowed);
    const denied = decisions.filter((decision) => !decision.allowed);
    expect(allowed).toHaveLength(10);
    expect(denied).toHaveLength(40);
    expect(denied.every((decision) => decision.retryAfterSeconds > 0)).toBe(true);
  });

  it('concede exactamente el limite de login bajo concurrencia', async () => {
    const { store } = build();

    const decisions = await Promise.all(
      Array.from({ length: 60 }, () => store.consume('login', '198.51.100.7')),
    );

    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(30);
  });

  it('cuenta todo intento, incluidos los ya denegados', async () => {
    const { store, client } = build();

    await store.consume('register', '198.51.100.7');
    for (let attempt = 0; attempt < 14; attempt += 1) {
      await store.consume('register', '198.51.100.7');
    }

    expect(await client.get('gateway:edge:register:198.51.100.7')).toBe('15');
  });

  it('fija la ventana al primer intento y no la reinicia en los siguientes', async () => {
    const { store, client } = build();

    await store.consume('register', '198.51.100.7');
    const initial = await client.pttl('gateway:edge:register:198.51.100.7');
    expect(initial).toBeGreaterThan(0);
    expect(initial).toBeLessThanOrEqual(600_000);

    await new Promise((resolve) => setTimeout(resolve, 1100));
    await store.consume('register', '198.51.100.7');
    const after = await client.pttl('gateway:edge:register:198.51.100.7');

    expect(after).toBeLessThan(initial);
    expect(after).toBeGreaterThan(0);
  });

  it('deja expirar la ventana y vuelve a admitir el trafico', async () => {
    const shortWindow = {
      ...config,
      registerRateLimit: { limit: 2, windowSeconds: 1 },
    } as unknown as GatewayConfig;
    const { store } = build(shortWindow);

    expect((await store.consume('register', '198.51.100.7')).allowed).toBe(true);
    expect((await store.consume('register', '198.51.100.7')).allowed).toBe(true);
    expect((await store.consume('register', '198.51.100.7')).allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 1400));

    expect((await store.consume('register', '198.51.100.7')).allowed).toBe(true);
  });

  it('separa los contadores por ambito y por origen', async () => {
    const { store, client } = build();

    await store.consume('register', '198.51.100.7');
    await store.consume('login', '198.51.100.7');
    await store.consume('register', '203.0.113.5');

    expect(await client.get('gateway:edge:register:198.51.100.7')).toBe('1');
    expect(await client.get('gateway:edge:login:198.51.100.7')).toBe('1');
    expect(await client.get('gateway:edge:register:203.0.113.5')).toBe('1');
  });

  it('falla cerrado y no concede trafico cuando Redis esta caido', async () => {
    const dead = new Redis('redis://127.0.0.1:56399', {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    const store = new RateLimitStore(config, new IoredisScriptAdapter(dead));

    await expect(store.consume('register', '198.51.100.7')).rejects.toBeInstanceOf(
      GatewayDependencyError,
    );
    dead.disconnect();
  });
});
