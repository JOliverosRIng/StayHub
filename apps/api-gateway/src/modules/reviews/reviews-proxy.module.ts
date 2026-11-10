import { Module } from '@nestjs/common';

import { GATEWAY_CONFIG, type GatewayConfig } from '@gateway/infrastructure/config/gateway-config';
import { ReviewsClient } from '@gateway/infrastructure/http/reviews.client';
import { ReviewsServiceTokenProvider } from '@gateway/infrastructure/service-auth/service-token.provider';

import { ReviewsController } from './reviews.controller';

@Module({
  controllers: [ReviewsController],
  providers: [
    ReviewsServiceTokenProvider,
    {
      provide: ReviewsClient,
      useFactory: (
        config: GatewayConfig,
        token: ReviewsServiceTokenProvider,
      ): ReviewsClient => new ReviewsClient(config, token),
      inject: [GATEWAY_CONFIG, ReviewsServiceTokenProvider],
    },
  ],
})
export class ReviewsProxyModule {}
