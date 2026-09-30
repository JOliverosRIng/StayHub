import { Global, Module } from '@nestjs/common';

import { GatewayRedisService } from './gateway-redis.service';
import { GATEWAY_REDIS, RateLimitStore } from './rate-limit.store';
import { GatewayConfigModule } from '../config/config.module';

@Global()
@Module({
  imports: [GatewayConfigModule],
  providers: [
    GatewayRedisService,
    { provide: GATEWAY_REDIS, useExisting: GatewayRedisService },
    RateLimitStore,
  ],
  exports: [GatewayRedisService, GATEWAY_REDIS, RateLimitStore],
})
export class GatewayRedisModule {}
