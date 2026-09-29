import { Module } from '@nestjs/common';

import { UsersConfigModule } from './infrastructure/config/config.module';
import { PrismaModule } from './infrastructure/persistence/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [UsersConfigModule, PrismaModule, HealthModule],
})
export class AppModule {}
