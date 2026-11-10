import { Controller, Get, Header, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import { RabbitMqPublisher } from '../../infrastructure/messaging/rabbitmq.publisher';
import { OUTBOX_REPOSITORY } from '../../infrastructure/messaging/outbox.tokens';
import type { OutboxRelayRepository } from '../../application/ports/outbox.repository';
import { RECONCILIATION_REPOSITORY } from '../../infrastructure/messaging/reconciliation.tokens';
import type { ReconciliationRepository } from '../../application/ports/reconciliation.repository';

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
    @Inject(RECONCILIATION_REPOSITORY) private readonly reconciliation: ReconciliationRepository,
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
  @ApiProduces('text/plain')
  @ApiOperation({ operationId: 'getPaymentsMetrics', summary: 'Métricas Prometheus internas.' })
  @ApiResponse({
    status: 200,
    description: 'Métricas Prometheus.',
    content: { 'text/plain': { schema: { type: 'string' } } },
  })
  async metrics(): Promise<string> {
    const [counts, oldestPendingAgeSeconds] = await Promise.all([
      this.outbox.countByStatus(),
      this.reconciliation.oldestPendingAgeSeconds(),
    ]);
    return [
      '# HELP payments_outbox_pending Number of payment events awaiting publication.',
      '# TYPE payments_outbox_pending gauge',
      `payments_outbox_pending ${counts.pending}`,
      '# HELP payments_outbox_dead Number of payment events that exhausted publication attempts.',
      '# TYPE payments_outbox_dead gauge',
      `payments_outbox_dead ${counts.dead}`,
      '# HELP payments_pending_age_seconds Age in seconds of the oldest pending charge or refund.',
      '# TYPE payments_pending_age_seconds gauge',
      `payments_pending_age_seconds ${oldestPendingAgeSeconds}`,
      '',
    ].join('\n');
  }
}
