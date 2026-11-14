import { Module } from '@nestjs/common';

import { GATEWAY_CONFIG, type GatewayConfig } from '@gateway/infrastructure/config/gateway-config';
import { AccommodationsClient } from '@gateway/infrastructure/http/accommodations.client';

import { AccommodationsController } from './accommodations.controller';

@Module({
  controllers: [AccommodationsController],
  providers: [
    {
      provide: AccommodationsClient,
      useFactory: (config: GatewayConfig): AccommodationsClient => new AccommodationsClient(config),
      inject: [GATEWAY_CONFIG],
    },
  ],
})
export class AccommodationsProxyModule {}
