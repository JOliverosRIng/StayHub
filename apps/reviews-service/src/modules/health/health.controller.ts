import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '@reviews/infrastructure/persistence/prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  public constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  @ApiOkResponse({ description: 'Process is alive.' })
  public live(): Readonly<Record<string, string>> { return { status: 'ok' }; }

  @Get('ready')
  @ApiOkResponse({ description: 'Configuration, database and migrations are ready.' })
  @ApiServiceUnavailableResponse({ description: 'Database or migrations are not ready.' })
  public async ready(): Promise<Readonly<Record<string, unknown>>> {
    if (!(await this.prisma.isReady())) throw new HttpException({ code: 'NOT_READY' }, HttpStatus.SERVICE_UNAVAILABLE);
    return { status: 'ready', database: 'up', migrations: 'applied', bookings: 'checked-per-request' };
  }
}
