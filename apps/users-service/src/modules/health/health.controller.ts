import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from '@users/infrastructure/persistence/prisma/prisma.service';
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}
  @Get('live') @ApiOperation({ operationId: 'usersLiveness' }) @ApiResponse({ status: 200, description: 'Process is alive.' })
  live(): { status: string } { return { status: 'live' }; }
  @Get('ready') @ApiOperation({ operationId: 'usersReadiness' }) @ApiResponse({ status: 200, description: 'Database is ready.' }) @ApiResponse({ status: 503, description: 'Database is unavailable.' })
  async ready(): Promise<{ status: string }> { if (!await this.prisma.ready()) throw new ServiceUnavailableException(); return { status: 'ready' }; }
}
