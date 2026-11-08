import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';

export interface ReadinessResponse {
  readonly status: 'ok' | 'degraded';
  readonly checks: {
    readonly database: 'up' | 'down';
    readonly migration: 'applied' | 'pending';
    readonly rabbitmq: 'up' | 'degraded';
  };
}

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  live(): { readonly status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<ReadinessResponse> {
    const [databaseReady, migrationApplied] = await Promise.all([
      this.prisma.isReachable(),
      this.prisma.hasAppliedMigrations(),
    ]);
    const checks: ReadinessResponse['checks'] = {
      database: databaseReady ? 'up' : 'down',
      migration: migrationApplied ? 'applied' : 'pending',
      // RabbitMQ is optional; no relay/health adapter is active yet.
      rabbitmq: 'degraded',
    };
    if (!databaseReady || !migrationApplied) {
      throw new HttpException('Payments dependencies are not ready', HttpStatus.SERVICE_UNAVAILABLE);
    }
    return { status: checks.rabbitmq === 'degraded' ? 'degraded' : 'ok', checks };
  }
}
