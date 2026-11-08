import { Controller, Get, Header, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import { RabbitMqPublisher } from '../../infrastructure/messaging/rabbitmq.publisher';
import { OUTBOX_REPOSITORY } from '../../infrastructure/messaging/outbox.tokens';
import type { OutboxRelayRepository } from '../../application/ports/outbox.repository';

export interface ReadinessResponse {
  readonly status: 'ok' | 'degraded';
  readonly checks: {
    readonly database: 'up' | 'down';
    readonly migration: 'applied' | 'pending';
    readonly rabbitmq: 'up' | 'degraded';
  };
}

@Controller('health')
@ApiTags('Health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitmq: RabbitMqPublisher,
    @Inject(OUTBOX_REPOSITORY) private readonly outbox: OutboxRelayRepository,
  ) {}

  @Get('live')
  @ApiOperation({ operationId: 'getLiveness', summary: 'Liveness' })
  @ApiResponse({ status: 200, description: 'Proceso vivo.' })
  live(): { readonly status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ operationId: 'getReadiness', summary: 'Readiness (base de datos y migración; RabbitMQ degradado no bloquea)' })
  @ApiResponse({
    status: 200,
    description: 'Listo.',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Readiness' } } },
  })
  @ApiResponse({
    status: 503,
    description: 'No listo.',
    content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } },
  })
  async ready(): Promise<ReadinessResponse> {
    const [databaseReady, migrationApplied] = await Promise.all([
      this.prisma.isReachable(),
      this.prisma.hasAppliedMigrations(),
    ]);
    const checks: ReadinessResponse['checks'] = {
      database: databaseReady ? 'up' : 'down',
      migration: migrationApplied ? 'applied' : 'pending',
      rabbitmq: this.rabbitmq.isHealthy() ? 'up' : 'degraded',
    };
    if (!databaseReady || !migrationApplied) {
      throw new HttpException('Payments dependencies are not ready', HttpStatus.SERVICE_UNAVAILABLE);
    }
    return { status: checks.rabbitmq === 'degraded' ? 'degraded' : 'ok', checks };
  }

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async metrics(): Promise<string> {
    const counts = await this.outbox.countByStatus();
    return [
      '# HELP payments_outbox_pending Number of payment events awaiting publication.',
      '# TYPE payments_outbox_pending gauge',
      `payments_outbox_pending ${counts.pending}`,
      '# HELP payments_outbox_dead Number of payment events that exhausted publication attempts.',
      '# TYPE payments_outbox_dead gauge',
      `payments_outbox_dead ${counts.dead}`,
      '',
    ].join('\n');
  }
}
