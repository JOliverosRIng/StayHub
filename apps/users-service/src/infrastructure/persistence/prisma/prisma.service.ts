import { Inject, Injectable, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma';
import { USERS_CONFIG, type UsersConfig } from '../../config/users-config';
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(USERS_CONFIG) config: UsersConfig) { super({ datasources: { db: { url: config.databaseUrl } }, log: [] }); }
  async onModuleInit(): Promise<void> { await this.$connect(); }
  async onModuleDestroy(): Promise<void> { await this.$disconnect(); }
  async ready(): Promise<boolean> {
    try {
      const rows = await this.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL AND migration_name IN ('202609280001_create_users', '202609280002_add_profile_photo')`;
      return Number(rows[0]?.count) === 2;
    } catch { return false; }
  }
}
