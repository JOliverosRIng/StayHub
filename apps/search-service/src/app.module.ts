import { Module } from '@nestjs/common';
import { SearchConfigModule } from './infrastructure/config/config.module';
import { PrismaModule } from './infrastructure/persistence/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { SearchModule } from './modules/search/search.module';
@Module({ imports: [SearchConfigModule, PrismaModule, SearchModule, HealthModule] })
export class AppModule {}
