import { Module } from '@nestjs/common';
import type { ClockPort } from '../application/ports/clock.port';
import { RefundPayment } from '../application/refunds/refund-payment.use-case';
import type { PaymentGatewayPort } from '../application/ports/payment-gateway.port';
import { PAYMENTS_CONFIG, type PaymentsConfig } from '../infrastructure/config/payments-config';
import { PaymentsModule, PAYMENT_GATEWAY, PAYMENT_UNIT_OF_WORK } from './payments.module';
import { PrismaUnitOfWork } from '../infrastructure/persistence/prisma/unit-of-work';
import { ServiceAuthGuard } from '../interfaces/http/guards/service-auth.guard';
import { RefundsController } from '../interfaces/http/refunds/refunds.controller';

@Module({
  imports: [PaymentsModule],
  controllers: [RefundsController],
  providers: [
    ServiceAuthGuard,
    {
      provide: RefundPayment,
      inject: [PAYMENT_UNIT_OF_WORK, PAYMENT_GATEWAY, PAYMENTS_CONFIG],
      useFactory: (
        unitOfWork: PrismaUnitOfWork,
        gateway: PaymentGatewayPort,
        config: PaymentsConfig,
      ): RefundPayment => new RefundPayment({
        unitOfWork,
        gateway,
        clock: { now: (): Date => new Date() } satisfies ClockPort,
        config,
      }),
    },
  ],
})
export class RefundsModule {}
