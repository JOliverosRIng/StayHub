import { Module } from '@nestjs/common';

import { GATEWAY_CONFIG, type GatewayConfig } from '@gateway/infrastructure/config/gateway-config';
import { SearchClient } from '@gateway/infrastructure/http/search.client';
import { SearchServiceTokenProvider } from '@gateway/infrastructure/service-auth/service-token.provider';

import { SearchController } from './search.controller';

@Module({
  controllers: [SearchController],
  providers: [
    SearchServiceTokenProvider,
    {
      provide: SearchClient,
      useFactory: (config: GatewayConfig, token: SearchServiceTokenProvider): SearchClient =>
        new SearchClient(config, token),
      inject: [GATEWAY_CONFIG, SearchServiceTokenProvider],
    },
  ],
})
export class SearchProxyModule {}
