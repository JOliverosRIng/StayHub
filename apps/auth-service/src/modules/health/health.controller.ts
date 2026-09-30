import { Controller, Get, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AUTH_CACHE, type AuthCache } from '@auth/application/ports/cache.port';
import { PrismaService } from '@auth/infrastructure/persistence/prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  public constructor(
    private readonly prisma: PrismaService,
    @Inject(AUTH_CACHE) private readonly cache: AuthCache,
  ) {}

  @Get('live')
  @ApiOperation({ operationId: 'authLiveness' })
  @ApiResponse({ status: 200, description: 'Process is alive.' })
  public live(): { readonly status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ operationId: 'authReadiness' })
  @ApiResponse({ status: 200, description: 'Required dependencies are ready.' })
  @ApiResponse({ status: 503, description: 'A required dependency is unavailable.' })
  public async ready(): Promise<{ readonly status: 'ready' }> {
    const [database, migrations, redis] = await Promise.all([
      this.prisma.isReachable(),
      this.prisma.hasAppliedMigrations(),
      this.cache.ping(),
    ]);
    if (!database || !migrations || !redis) {
      throw new HttpException('Auth dependencies are not ready', HttpStatus.SERVICE_UNAVAILABLE);
    }
    return { status: 'ready' };
  }
}

