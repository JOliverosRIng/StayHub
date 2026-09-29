import { Global, Module } from '@nestjs/common';

import { GATEWAY_CONFIG, loadGatewayConfig } from './gateway-config';

@Global()
@Module({
  providers: [{ provide: GATEWAY_CONFIG, useFactory: loadGatewayConfig }],
  exports: [GATEWAY_CONFIG],
})
export class GatewayConfigModule {}
