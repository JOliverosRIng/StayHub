import { lookup } from 'node:dns/promises';
import { readFileSync } from 'node:fs';

import { Module } from '@nestjs/common';

import { GatewayRedisModule } from '@gateway/infrastructure/cache/gateway-redis.module';
import { GatewayConfigModule } from '@gateway/infrastructure/config/config.module';
import type { TlsConfig } from '@gateway/infrastructure/config/gateway-config';

import {
  HealthController,
  HEALTH_HOST_RESOLVER,
  HEALTH_TLS_READER,
  type HostResolver,
  type TlsReader,
} from './health.controller';

const fileTlsReader: TlsReader = {
  readable(tls: TlsConfig): boolean {
    try {
      return readFileSync(tls.certFile).length > 0 && readFileSync(tls.keyFile).length > 0;
    } catch {
      return false;
    }
  },
};

const dnsHostResolver: HostResolver = {
  async resolves(host: string): Promise<boolean> {
    try {
      await lookup(host);
      return true;
    } catch {
      return false;
    }
  },
};

@Module({
  imports: [GatewayConfigModule, GatewayRedisModule],
  controllers: [HealthController],
  providers: [
    { provide: HEALTH_TLS_READER, useValue: fileTlsReader },
    { provide: HEALTH_HOST_RESOLVER, useValue: dnsHostResolver },
  ],
})
export class HealthModule {}
