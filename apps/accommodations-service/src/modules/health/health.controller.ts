import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { PrismaService } from '@accommodations/infrastructure/persistence/prisma/prisma.service';
@ApiExcludeController()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}
  @Get('live')
  live(): { status: string } { return { status: 'live' }; }
  @Get('ready')
  async ready(): Promise<{ status: string }> { if (!await this.prisma.ready()) throw new ServiceUnavailableException(); return { status: 'ready' }; }
}
