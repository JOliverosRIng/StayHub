import { Module } from '@nestjs/common';
import { PublishOutbox } from '../application/events/publish-outbox.use-case';
import { PAYMENTS_CONFIG, type PaymentsConfig } from '../infrastructure/config/payments-config';
import { RabbitMqPublisher } from '../infrastructure/messaging/rabbitmq.publisher';
import { OutboxRelay } from '../infrastructure/messaging/outbox.relay';
import { PrismaOutboxRepository } from '../infrastructure/persistence/prisma/outbox.repository';
import { PrismaService } from '../infrastructure/persistence/prisma/prisma.service';
import { EVENT_PUBLISHER, OUTBOX_REPOSITORY } from '../infrastructure/messaging/outbox.tokens';

export { EVENT_PUBLISHER, OUTBOX_REPOSITORY } from '../infrastructure/messaging/outbox.tokens';

@Module({
  providers: [
    RabbitMqPublisher,
    { provide: EVENT_PUBLISHER, useExisting: RabbitMqPublisher },
    {
      provide: OUTBOX_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): PrismaOutboxRepository => new PrismaOutboxRepository(prisma),
    },
    {
      provide: PublishOutbox,
      inject: [OUTBOX_REPOSITORY, EVENT_PUBLISHER, PAYMENTS_CONFIG],
      useFactory: (repository: PrismaOutboxRepository, publisher: RabbitMqPublisher, config: PaymentsConfig): PublishOutbox =>
        new PublishOutbox(repository, publisher, {
          batchSize: config.outboxBatchSize,
          maxAttempts: config.outboxMaxAttempts,
          leaseMs: Math.max(config.outboxPollIntervalMs * 2, 30_000),
          retryBaseMs: 1_000,
          retryMaxMs: 300_000,
        }),
    },
    OutboxRelay,
  ],
  exports: [EVENT_PUBLISHER, OUTBOX_REPOSITORY, RabbitMqPublisher],
})
export class OutboxModule {}
