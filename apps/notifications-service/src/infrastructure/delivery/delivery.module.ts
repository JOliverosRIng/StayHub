import { Global, Module } from '@nestjs/common';
import { DELIVERY_ADAPTERS, type DeliveryPort } from '../../application/ports/delivery.port';
import { FakeEmailAdapter } from './fake-email.adapter';
import { InAppAdapter } from './in-app.adapter';

@Global()
@Module({
  providers: [
    { provide: FakeEmailAdapter, useFactory: (): FakeEmailAdapter => new FakeEmailAdapter() },
    { provide: InAppAdapter, useFactory: (): InAppAdapter => new InAppAdapter() },
    { provide: DELIVERY_ADAPTERS, useFactory: (email: FakeEmailAdapter, inApp: InAppAdapter): DeliveryPort[] => [email, inApp], inject: [FakeEmailAdapter, InAppAdapter] },
  ],
  exports: [DELIVERY_ADAPTERS],
})
export class DeliveryModule {}
