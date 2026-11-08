import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { OutboxModule } from '../outbox.module';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import { PrismaReconciliationRepository } from '../../infrastructure/persistence/prisma/reconciliation.repository';
import { RECONCILIATION_REPOSITORY } from '../../infrastructure/messaging/reconciliation.tokens';

@Module({
  imports: [OutboxModule],
  controllers: [HealthController],
  providers: [{
    provide: RECONCILIATION_REPOSITORY,
    inject: [PrismaService],
    useFactory: (prisma: PrismaService): PrismaReconciliationRepository => new PrismaReconciliationRepository(prisma),
  }],
})
export class HealthModule {}
