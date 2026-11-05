import { Module } from '@nestjs/common';
import { ConfigModule } from './infrastructure/config/config.module';
import { PrismaModule } from './infrastructure/persistence/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { PropertiesModule } from './modules/properties/properties.module';

@Module({ imports: [ConfigModule, PrismaModule, AuthModule, HealthModule, PropertiesModule] })
export class AppModule {}
