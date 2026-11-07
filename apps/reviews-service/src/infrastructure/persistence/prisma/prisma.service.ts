import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../generated/client';
import { REVIEWS_CONFIG } from '@reviews/infrastructure/config/config.module';
import type { ReviewsConfig } from '@reviews/infrastructure/config/reviews-config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  public constructor(@Inject(REVIEWS_CONFIG) config: ReviewsConfig) {
    super({ datasources: { db: { url: config.databaseUrl } } });
  }
  public async onModuleInit(): Promise<void> { await this.$connect(); }
  public async onModuleDestroy(): Promise<void> { await this.$disconnect(); }
  public async isReady(): Promise<boolean> {
    try {
      await this.$queryRawUnsafe('SELECT 1 FROM "_prisma_migrations" LIMIT 1');
      await this.$queryRawUnsafe('SELECT 1 FROM "reviews" LIMIT 1');
      return true;
    } catch { return false; }
  }
}
