import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '@bookings/infrastructure/persistence/prisma/prisma.service';

@Controller('health')
export class HealthController {
  public constructor(private readonly prisma: PrismaService) {}
  @Get('live') public live(): { status: string } { return { status: 'ok' }; }
  @Get('ready') public async ready(): Promise<{ status: string }> { if (!await this.prisma.isReady()) throw new ServiceUnavailableException('database not ready'); return { status: 'ready' }; }
}
