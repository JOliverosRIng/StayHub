import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from '@search/infrastructure/persistence/prisma/prisma.service';
import { SEARCH_CACHE_PORT, type SearchCachePort } from '@search/application/ports/search-cache.port';
import { RabbitMqHealth } from '@search/infrastructure/health/rabbitmq-health';
import { ShutdownState } from '@search/infrastructure/lifecycle/shutdown-state';
import { SEARCH_CONFIG } from '@search/infrastructure/config/config.module';
import type { SearchConfig } from '@search/infrastructure/config/search-config';

async function probe(action: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try { return await Promise.race([Promise.resolve().then(action).catch(() => false), new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); })]); }
  finally { if (timer) clearTimeout(timer); }
}

@Controller('health')
export class HealthController {
  public constructor(private readonly prisma: PrismaService, @Inject(SEARCH_CACHE_PORT) private readonly cache: SearchCachePort, private readonly broker: RabbitMqHealth, private readonly shutdown: ShutdownState, @Inject(SEARCH_CONFIG) private readonly config: SearchConfig) {}
  @Get('live')
  @ApiOperation({ operationId: 'searchLiveness' })
  @ApiResponse({ status: 200, description: 'Proceso vivo.' })
  public live(): { status: 'ok' } { return { status: 'ok' }; }
  @Get('ready')
  @ApiOperation({ operationId: 'searchReadiness' })
  @ApiResponse({ status: 200, description: 'Configuración, migraciones y PostgreSQL listos.' })
  @ApiResponse({ status: 503, description: 'Dependencia autoritativa no disponible.' })
  public async ready(): Promise<{ status: 'ready'; degraded: readonly string[] }> {
    if (this.shutdown.isStopping) throw new ServiceUnavailableException();
    const timeout = this.config.dependencyTimeoutMs;
    const [database, redis, rabbitmq] = await Promise.all([
      probe(() => this.prisma.isHealthy(), timeout), probe(() => this.cache.health(), timeout), probe(() => this.broker.health(), timeout),
    ]);
    if (!database || this.shutdown.isStopping) throw new ServiceUnavailableException();
    return { status: 'ready', degraded: [...(redis ? [] : ['redis']), ...(rabbitmq ? [] : ['rabbitmq'])] };
  }
}
