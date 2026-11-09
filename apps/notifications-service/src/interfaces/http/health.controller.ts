import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  live(): { status: string } { return { status: 'ok' }; }

  @Get('ready')
  async ready(): Promise<{ status: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1 FROM "Notification" LIMIT 1`;
      await this.prisma.$queryRaw`SELECT 1 FROM "ScheduledNotification" LIMIT 1`;
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Notification storage is unavailable');
    }
  }
}
