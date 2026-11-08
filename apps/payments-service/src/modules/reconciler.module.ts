import { Module } from '@nestjs/common';
import { ReconcilePending } from '../application/payments/reconcile-pending.use-case';
import { PAYMENTS_CONFIG, type PaymentsConfig } from '../infrastructure/config/payments-config';
import { RECONCILIATION_REPOSITORY } from '../infrastructure/messaging/reconciliation.tokens';
import { PrismaReconciliationRepository } from '../infrastructure/persistence/prisma/reconciliation.repository';
import { PrismaService } from '../infrastructure/persistence/prisma/prisma.service';
import { PAYMENT_GATEWAY, PAYMENT_UNIT_OF_WORK } from './payments.module';
import type { PaymentGatewayPort } from '../application/ports/payment-gateway.port';
import type { PrismaUnitOfWork } from '../infrastructure/persistence/prisma/unit-of-work';
import { ReconcilerScheduler } from './reconciler.scheduler';
import { PaymentsModule } from './payments.module';
import { PaymentsLogger } from '../infrastructure/logging/payments-logger';

@Module({
  imports: [PaymentsModule],
  providers: [
    {
      provide: RECONCILIATION_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): PrismaReconciliationRepository => new PrismaReconciliationRepository(prisma),
    },
    {
      provide: ReconcilePending,
      inject: [RECONCILIATION_REPOSITORY, PAYMENT_UNIT_OF_WORK, PAYMENT_GATEWAY, PAYMENTS_CONFIG, PaymentsLogger],
      useFactory: (
        repository: PrismaReconciliationRepository,
        unitOfWork: PrismaUnitOfWork,
        gateway: PaymentGatewayPort,
        config: PaymentsConfig,
        logger: PaymentsLogger,
      ): ReconcilePending => new ReconcilePending(repository, unitOfWork, gateway, {
        batchSize: config.reconcilerBatchSize,
        maxAttempts: config.reconcilerMaxAttempts,
        intervalMs: config.reconcilerIntervalMs,
        leaseMs: Math.max(config.reconcilerIntervalMs, config.gatewayTimeoutMs * 2),
      }, undefined, { resolved: (record) => logger.event('payments.reconciliation.resolved', record) }),
    },
    PaymentsLogger,
    ReconcilerScheduler,
  ],
})
export class ReconcilerModule {}
