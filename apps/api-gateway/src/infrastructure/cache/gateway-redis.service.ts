import { Inject, Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import Redis from 'ioredis';

import { GATEWAY_CONFIG, type GatewayConfig } from '@gateway/infrastructure/config/gateway-config';

import type { RedisScriptPort } from './rate-limit.store';

@Injectable()
export class GatewayRedisService implements RedisScriptPort, OnModuleDestroy {
  private readonly redis: Redis;
  private readonly ownsClient: boolean;

  public constructor(
    @Inject(GATEWAY_CONFIG) config: GatewayConfig,
    @Optional() client?: Redis,
  ) {
    this.redis = client ?? new Redis(config.redis.url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    this.ownsClient = client === undefined;
  }

  public async eval(
    script: string,
    numKeys: number,
    ...args: (string | number)[]
  ): Promise<unknown> {
    if (this.redis.status === 'wait') {
      await this.redis.connect();
    }
    return this.redis.eval(script, numKeys, ...args);
  }

  public async ping(): Promise<boolean> {
    try {
      if (this.redis.status === 'wait') {
        await this.redis.connect();
      }
      return (await this.redis.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  public async onModuleDestroy(): Promise<void> {
    if (!this.ownsClient || this.redis.status === 'end') {
      return;
    }
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }
}
