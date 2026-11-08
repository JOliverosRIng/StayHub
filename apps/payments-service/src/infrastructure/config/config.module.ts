import { Global, Module } from '@nestjs/common';
import { loadPaymentsConfig, PAYMENTS_CONFIG } from './payments-config';

@Global()
@Module({
  providers: [{ provide: PAYMENTS_CONFIG, useFactory: loadPaymentsConfig }],
  exports: [PAYMENTS_CONFIG],
})
export class PaymentsConfigModule {}
