import { Inject, Injectable } from '@nestjs/common';

import { GatewayDependencyError } from '@gateway/application/errors/gateway-errors';
import { GATEWAY_CONFIG, type GatewayConfig } from '@gateway/infrastructure/config/gateway-config';

export const RATE_LIMIT_SCOPE = {
  REGISTER: 'register',
  LOGIN: 'login',
} as const;

export const GATEWAY_REDIS = Symbol('GATEWAY_REDIS');

export type RateLimitScope = (typeof RATE_LIMIT_SCOPE)[keyof typeof RATE_LIMIT_SCOPE];

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

export interface RedisScriptPort {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

const RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if count == 1 or ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1]))
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`;

@Injectable()
export class RateLimitStore {
  public constructor(
    @Inject(GATEWAY_CONFIG) private readonly config: GatewayConfig,
    @Inject(GATEWAY_REDIS) private readonly redis: RedisScriptPort,
  ) {}

  public async consume(scope: RateLimitScope, origin: string): Promise<RateLimitDecision> {
    const policy =
      scope === RATE_LIMIT_SCOPE.REGISTER
        ? this.config.registerRateLimit
        : this.config.loginRateLimit;
    const key = `${this.config.redis.namespace}:${scope}:${origin}`;

    let result: unknown;
    try {
      result = await this.redis.eval(
        RATE_LIMIT_SCRIPT,
        1,
        key,
        policy.windowSeconds * 1000,
      );
    } catch {
      throw new GatewayDependencyError('redis');
    }

    if (!Array.isArray(result) || result.length < 2) {
      throw new GatewayDependencyError('redis');
    }
    const [count, ttlMillis] = result as [unknown, unknown];
    if (typeof count !== 'number' || typeof ttlMillis !== 'number' || count < 1) {
      throw new GatewayDependencyError('redis');
    }

    const allowed = count <= policy.limit;
    return {
      allowed,
      remaining: Math.max(0, policy.limit - count),
      retryAfterSeconds: allowed ? 0 : toRetryAfterSeconds(ttlMillis),
    };
  }
}

function toRetryAfterSeconds(ttlMillis: number): number {
  const seconds = ttlMillis <= 0 ? 1 : Math.ceil(ttlMillis / 1000);
  return Math.max(1, seconds);
}
