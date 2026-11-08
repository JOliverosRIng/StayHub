import { Module } from '@nestjs/common';
import type { ClockPort } from '../application/ports/clock.port';
import { CreatePayment } from '../application/payments/create-payment.use-case';
import { GetPaymentStatus } from '../application/payments/get-payment-status.use-case';
import type { PaymentGatewayPort } from '../application/ports/payment-gateway.port';
import { PAYMENTS_CONFIG, type PaymentsConfig } from '../infrastructure/config/payments-config';
import { PaymentsConfigModule } from '../infrastructure/config/config.module';
import { MockPaymentGatewayAdapter } from '../infrastructure/gateway/mock-payment-gateway.adapter';
import { PrismaModule } from '../infrastructure/persistence/prisma/prisma.module';
import { PrismaService } from '../infrastructure/persistence/prisma/prisma.service';
import { PrismaPaymentStatusReader } from '../infrastructure/persistence/prisma/payment-status.reader';
import { PrismaUnitOfWork } from '../infrastructure/persistence/prisma/unit-of-work';
import { ServiceAuthGuard } from '../interfaces/http/guards/service-auth.guard';
import { PaymentReadAuthGuard } from '../interfaces/http/guards/payment-read-auth.guard';
import { PaymentsController } from '../interfaces/http/payments/payments.controller';

export const PAYMENT_UNIT_OF_WORK = Symbol('PAYMENT_UNIT_OF_WORK');
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
export const PAYMENT_STATUS_READER = Symbol('PAYMENT_STATUS_READER');

@Module({
  imports: [PaymentsConfigModule, PrismaModule],
  controllers: [PaymentsController],
  providers: [
    ServiceAuthGuard,
    PaymentReadAuthGuard,
    MockPaymentGatewayAdapter,
    {
      provide: PAYMENT_UNIT_OF_WORK,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): PrismaUnitOfWork => new PrismaUnitOfWork(prisma),
    },
    { provide: PAYMENT_GATEWAY, useExisting: MockPaymentGatewayAdapter },
    {
      provide: PAYMENT_STATUS_READER,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): PrismaPaymentStatusReader => new PrismaPaymentStatusReader(prisma),
    },
    {
      provide: GetPaymentStatus,
      inject: [PAYMENT_STATUS_READER],
      useFactory: (reader: PrismaPaymentStatusReader): GetPaymentStatus => new GetPaymentStatus(reader),
    },
    {
      provide: CreatePayment,
      inject: [PAYMENT_UNIT_OF_WORK, PAYMENT_GATEWAY, PAYMENTS_CONFIG],
      useFactory: (
        unitOfWork: PrismaUnitOfWork,
        gateway: PaymentGatewayPort,
        config: PaymentsConfig,
      ): CreatePayment => new CreatePayment({
        unitOfWork,
        gateway,
        clock: { now: (): Date => new Date() } satisfies ClockPort,
        config,
      }),
    },
  ],
  exports: [CreatePayment, GetPaymentStatus],
})
export class PaymentsModule {}
