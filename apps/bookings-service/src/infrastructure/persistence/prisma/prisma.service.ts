import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import type { BookingsConfig } from '@bookings/infrastructure/config/bookings-config';
import { BOOKINGS_CONFIG } from '@bookings/infrastructure/config/config.module';

import { Prisma, PrismaClient } from '../generated/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  public constructor(
    @Inject(BOOKINGS_CONFIG)
    configOrOptions: BookingsConfig | Prisma.PrismaClientOptions,
  ) {
    super(
      'databaseUrl' in configOrOptions
        ? {
            datasources: {
              db: {
                url: configOrOptions.databaseUrl,
              },
            },
          }
        : configOrOptions,
    );
  }

  public async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  public async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  public async isReady(): Promise<boolean> {
    try {
      const rows = await this.$queryRaw<Array<{ ready: boolean }>>`
        SELECT
          to_regclass('public.bookings') IS NOT NULL
          AND to_regclass('public.outbox_events') IS NOT NULL AS ready
      `;

      return rows[0]?.ready === true;
    } catch {
      return false;
    }
  }
}