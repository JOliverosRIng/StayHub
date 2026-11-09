import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { NOTIFICATIONS_CONFIG, type NotificationsConfig } from '../../config/notifications-config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(NOTIFICATIONS_CONFIG) config: NotificationsConfig) {
    super({ datasources: { db: { url: config.databaseUrl } } });
  }
  async onModuleInit(): Promise<void> { await this.$connect(); }
  async onModuleDestroy(): Promise<void> { await this.$disconnect(); }
}
