import { Module } from '@nestjs/common';
import { GATEWAY_CONFIG, type GatewayConfig } from '@gateway/infrastructure/config/gateway-config';
import { BookingsClient } from '@gateway/infrastructure/http/bookings.client';
import { BookingsController } from './bookings.controller';
import { BookingsRateLimitGuard } from '@gateway/modules/rate-limit/bookings-rate-limit.guard';

@Module({
  controllers: [BookingsController],
  providers: [
    BookingsRateLimitGuard,
    { provide: BookingsClient, useFactory: (config: GatewayConfig): BookingsClient => new BookingsClient(config), inject: [GATEWAY_CONFIG] },
  ],
})
export class BookingsProxyModule {}
