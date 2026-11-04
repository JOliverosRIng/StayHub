import { Module } from '@nestjs/common';
import { SearchConfigModule } from './infrastructure/config/config.module';
import { PrismaModule } from './infrastructure/persistence/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { SearchModule } from './modules/search/search.module';
import { SuggestionsModule } from './modules/suggestions/suggestions.module';
import { ProjectionsModule } from './modules/projections/projections.module';
@Module({ imports: [SearchConfigModule, PrismaModule, SearchModule, SuggestionsModule, ProjectionsModule, HealthModule] })
export class AppModule {}
