import { GatewayDependencyError } from '@gateway/application/errors/gateway-errors';
import { RateLimitStore, type RedisScriptPort } from '@gateway/infrastructure/cache/rate-limit.store';

import { createTestGatewayConfig } from '../support/gateway-config-fixture';

class FakeRedis implements RedisScriptPort {
  public readonly calls: { key: string; windowMillis: number }[] = [];
  private result: unknown = [1, 600_000];
  private failure: Error | null = null;

  public setResult(result: unknown): void {
    this.result = result;
  }

  public failWith(error: Error): void {
    this.failure = error;
  }

  public eval(
    _script: string,
    _numKeys: number,
    key: string | number,
    windowMillis: string | number,
  ): Promise<unknown> {
    if (this.failure !== null) {
      return Promise.reject(this.failure);
    }
    this.calls.push({ key: String(key), windowMillis: Number(windowMillis) });
    return Promise.resolve(this.result);
  }
}

const { config } = createTestGatewayConfig();
const build = (): { store: RateLimitStore; redis: FakeRedis } => {
  const redis = new FakeRedis();
  return { store: new RateLimitStore(config, redis), redis };
};

describe('RateLimitStore (GW-014)', () => {
  it('aplica el limite de registro de 10 por 600 s', async () => {
    const { store, redis } = build();
    redis.setResult([1, 600_000]);

    const decision = await store.consume('register', '198.51.100.7');

    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(9);
    expect(decision.retryAfterSeconds).toBe(0);
    expect(redis.calls[0]?.windowMillis).toBe(600_000);
  });

  it('aplica el limite de login de 30 por 300 s', async () => {
    const { store, redis } = build();
    redis.setResult([1, 300_000]);

    const decision = await store.consume('login', '198.51.100.7');

    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(29);
    expect(redis.calls[0]?.windowMillis).toBe(300_000);
  });

  it('permite exactamente el limite y deniega el intento siguiente', async () => {
    const { store, redis } = build();
    redis.setResult([10, 480_000]);

    const decision = await store.consume('register', '198.51.100.7');

    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(0);
    expect(decision.retryAfterSeconds).toBe(0);
  });

  it('devuelve 429 con Retry-After cuando la ventana ya se agoto', async () => {
    const { store, redis } = build();
    redis.setResult([11, 317_400]);

    const decision = await store.consume('register', '198.51.100.7');

    expect(decision.allowed).toBe(false);
    expect(decision.remaining).toBe(0);
    expect(decision.retryAfterSeconds).toBe(318);
  });

  it('nunca informa un Retry-After de cero al denegar', async () => {
    const { store, redis } = build();
    redis.setResult([99, 0]);

    const decision = await store.consume('login', '198.51.100.7');

    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it('aisla cada ambito y origen en su propia clave con el namespace configurado', async () => {
    const { store, redis } = build();
    redis.setResult([1, 600_000]);

    await store.consume('register', '198.51.100.7');
    await store.consume('login', '198.51.100.7');
    await store.consume('register', '203.0.113.5');

    expect(redis.calls.map((call) => call.key)).toEqual([
      'gateway:edge:register:198.51.100.7',
      'gateway:edge:login:198.51.100.7',
      'gateway:edge:register:203.0.113.5',
    ]);
  });

  it('falla cerrado cuando Redis no esta disponible', async () => {
    const { store, redis } = build();
    redis.failWith(new Error('connect ECONNREFUSED'));

    await expect(store.consume('register', '198.51.100.7')).rejects.toBeInstanceOf(
      GatewayDependencyError,
    );
  });

  it('falla cerrado cuando la respuesta del script no es utilizable', async () => {
    for (const malformed of [null, 'PONG', [1], ['a', 'b']]) {
      const { store, redis } = build();
      redis.setResult(malformed);
      await expect(store.consume('register', '198.51.100.7')).rejects.toBeInstanceOf(
        GatewayDependencyError,
      );
    }
  });
});
