import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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
@ApiTags('Health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

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
      // RabbitMQ is optional; no relay/health adapter is active yet.
      rabbitmq: 'degraded',
    };
    if (!databaseReady || !migrationApplied) {
      throw new HttpException('Payments dependencies are not ready', HttpStatus.SERVICE_UNAVAILABLE);
    }
    return { status: checks.rabbitmq === 'degraded' ? 'degraded' : 'ok', checks };
  }
}
