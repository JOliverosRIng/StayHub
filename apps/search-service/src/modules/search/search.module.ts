import { Global, Module } from '@nestjs/common';
import { SEARCH_CONFIG } from '@search/infrastructure/config/config.module';
import type { SearchConfig } from '@search/infrastructure/config/search-config';
import { PrismaService } from '@search/infrastructure/persistence/prisma/prisma.service';
import { PostgreSqlSearchIndexAdapter } from '@search/infrastructure/search/postgresql-search-index.adapter';
import { RedisSearchCacheAdapter } from '@search/infrastructure/cache/redis-search-cache.adapter';
import { SEARCH_INDEX_PORT, type SearchIndexPort } from '@search/application/ports/search-index.port';
import { SEARCH_CACHE_PORT, type SearchCachePort } from '@search/application/ports/search-cache.port';
import { SearchAccommodations } from '@search/application/search/search-accommodations.use-case';
import { ServiceJwtVerifier } from '@search/infrastructure/security/service-jwt.verifier';
import { ServiceAuthGuard } from '@search/interfaces/http/guards/service-auth.guard';
import { SearchController } from '@search/interfaces/http/search.controller';
@Global()
@Module({
  controllers: [SearchController],
  providers: [
    { provide: SEARCH_INDEX_PORT, useFactory: (prisma: PrismaService): SearchIndexPort => new PostgreSqlSearchIndexAdapter(prisma), inject: [PrismaService] },
    { provide: SEARCH_CACHE_PORT, useFactory: (config: SearchConfig): SearchCachePort => new RedisSearchCacheAdapter(config), inject: [SEARCH_CONFIG] },
    { provide: SearchAccommodations, useFactory: (index: SearchIndexPort, cache: SearchCachePort): SearchAccommodations => new SearchAccommodations(index, cache), inject: [SEARCH_INDEX_PORT, SEARCH_CACHE_PORT] },
    ServiceJwtVerifier, ServiceAuthGuard,
  ],
  exports: [SEARCH_INDEX_PORT, SEARCH_CACHE_PORT, SearchAccommodations],
})
export class SearchModule {}
