import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '.prisma/users-client';

import { USERS_CONFIG, type UsersConfig } from '../../config/users-config';

export type PrismaTransactionClient = Prisma.TransactionClient;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  public constructor(@Inject(USERS_CONFIG) config: UsersConfig) {
    super({ datasources: { db: { url: config.databaseUrl } } });
  }

  public async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  public async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  public transaction<T>(
    work: (client: PrismaTransactionClient) => Promise<T>,
    options?: { readonly isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<T> {
    return options?.isolationLevel === undefined
      ? this.$transaction(work)
      : this.$transaction(work, { isolationLevel: options.isolationLevel });
  }

  public async isReachable(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  public async appliedMigrationNames(): Promise<readonly string[]> {
    const table = await this.$queryRaw<Array<{ exists: boolean }>>`
      SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS exists
    `;
    if (table[0]?.exists !== true) {
      return [];
    }
    const rows = await this.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name
      FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    `;
    return rows.map((row) => row.migration_name);
  }
}
