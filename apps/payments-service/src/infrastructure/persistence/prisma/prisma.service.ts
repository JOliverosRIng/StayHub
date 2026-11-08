import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../generated/client';
import { PAYMENTS_CONFIG, type PaymentsConfig } from '../../config/payments-config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  public constructor(@Inject(PAYMENTS_CONFIG) config: PaymentsConfig) {
    super({ datasourceUrl: config.databaseUrl, log: [] });
  }

  public async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  public async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  public async ready(): Promise<boolean> {
    try {
      const rows = await this.$queryRaw<Array<{ ready: boolean }>>`
        SELECT EXISTS (
          SELECT 1 FROM "_prisma_migrations"
          WHERE migration_name = '001_payments_core'
            AND finished_at IS NOT NULL
            AND rolled_back_at IS NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM "_prisma_migrations"
          WHERE finished_at IS NULL AND rolled_back_at IS NULL
        )
        AND to_regclass('public.payments') IS NOT NULL
        AND to_regclass('public.refunds') IS NOT NULL
        AND to_regclass('public.outbox_events') IS NOT NULL AS ready
      `;
      return rows[0]?.ready === true;
    } catch {
      return false;
    }
  }
}
