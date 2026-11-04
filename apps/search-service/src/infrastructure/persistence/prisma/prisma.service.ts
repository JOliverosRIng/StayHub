import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../generated/client';
import { SEARCH_CONFIG } from '../../config/config.module';
import type { SearchConfig } from '../../config/search-config';
import { observeDependency } from '../../observability/otel';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  public constructor(@Inject(SEARCH_CONFIG) private readonly config: SearchConfig) { super({ datasourceUrl: config.databaseUrl }); }
  public async onModuleInit(): Promise<void> { await this.$connect(); }
  public async onModuleDestroy(): Promise<void> { await this.$disconnect(); }
  public async isHealthy(): Promise<boolean> {
    return observeDependency('postgresql', 'readiness', async () => {
      try {
        return await this.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('statement_timeout', ${String(this.config.dependencyTimeoutMs)}, true)`;
          const migrations = await tx.$queryRaw<{ ready: boolean }[]>`
            SELECT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name = '001_search_projection' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
              AND NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL)
              AND EXISTS (SELECT 1 FROM "search_index_state" WHERE id = 1)
              AND to_regclass('public.search_documents') IS NOT NULL
              AND to_regclass('public.availability_windows') IS NOT NULL AS ready`;
          return migrations[0]?.ready === true;
        }, { timeout: this.config.dependencyTimeoutMs, maxWait: this.config.dependencyTimeoutMs });
      } catch { return false; }
    });
  }
}
