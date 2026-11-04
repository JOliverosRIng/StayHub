import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '@search/infrastructure/persistence/prisma/prisma.service';
import { SEARCH_CACHE_PORT, type SearchCachePort } from '@search/application/ports/search-cache.port';

@Controller('health')
export class HealthController {
  public constructor(private readonly prisma: PrismaService, @Inject(SEARCH_CACHE_PORT) private readonly cache: SearchCachePort) {}
  @Get('live') public live(): { status: 'ok' } { return { status: 'ok' }; }
  @Get('ready') public async ready(): Promise<{ status: 'ready'; degraded: readonly string[] }> {
    if (!(await this.prisma.isHealthy())) throw new ServiceUnavailableException('PostgreSQL is unavailable');
    const degraded = (await this.cache.health()) ? [] : ['redis'];
    return { status: 'ready', degraded };
  }
}
