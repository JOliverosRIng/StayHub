import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../../../../generated/client';
import { SEARCH_CONFIG } from '../../config/config.module';
import type { SearchConfig } from '../../config/search-config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  public constructor(@Inject(SEARCH_CONFIG) config: SearchConfig) {
    super({ datasourceUrl: config.databaseUrl });
  }
  public async onModuleInit(): Promise<void> { await this.$connect(); }
  public async onModuleDestroy(): Promise<void> { await this.$disconnect(); }
  public async isHealthy(): Promise<boolean> {
    try { await this.$queryRaw`SELECT 1`; return true; } catch { return false; }
  }
}
