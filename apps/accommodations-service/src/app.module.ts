import { Module } from '@nestjs/common';
import { ConfigModule } from './infrastructure/config/config.module';
import { PrismaModule } from './infrastructure/persistence/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';

@Module({ imports: [ConfigModule, PrismaModule, HealthModule] })
export class AppModule {}
