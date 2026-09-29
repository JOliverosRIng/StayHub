import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private static readonly EXPECTED_MIGRATIONS: readonly string[] = [
    '001_auth_registration',
    '002_auth_sessions',
    '003_registration_work',
    '004_session_revocation',
  ];

  public async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  public async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  public transaction<T>(
    work: (client: Prisma.TransactionClient) => Promise<T>,
    options?: { readonly isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<T> {
    return this.$transaction(work, options);
  }

  public async isReachable(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  public async hasAppliedMigrations(): Promise<boolean> {
    try {
      const rows = await this.$queryRaw<Array<{ migration_name: string }>>`
        SELECT migration_name
        FROM "_prisma_migrations"
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      `;
      const applied = new Set(rows.map((row) => row.migration_name));
      const failed = await this.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM "_prisma_migrations"
        WHERE finished_at IS NULL AND rolled_back_at IS NULL
      `;
      if ((failed[0]?.count ?? 0n) > 0n) return false;
      return PrismaService.EXPECTED_MIGRATIONS.every((name) => applied.has(name));
    } catch {
      return false;
    }
  }
}

