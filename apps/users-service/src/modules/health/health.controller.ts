import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import { MIGRATION_SOURCE, type MigrationSource } from './migration-source';

@Controller('health')
export class HealthController {
  public constructor(
    private readonly prisma: PrismaService,
    @Inject(MIGRATION_SOURCE) private readonly migrations: MigrationSource,
  ) {}

  @Get('live')
  public live(): { readonly status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  public async ready(): Promise<{ readonly status: 'ready' }> {
    if (!(await this.prisma.isReachable()) || !(await this.migrationsApplied())) {
      throw new ServiceUnavailableException('users-service is not ready');
    }
    return { status: 'ready' };
  }

  private async migrationsApplied(): Promise<boolean> {
    try {
      const [expected, applied] = await Promise.all([
        this.migrations.expectedMigrations(),
        this.prisma.appliedMigrationNames(),
      ]);
      const appliedNames = new Set(applied);
      return expected.every((name) => appliedNames.has(name));
    } catch {
      return false;
    }
  }
}
