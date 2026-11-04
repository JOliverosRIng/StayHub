import { Module } from "@nestjs/common";
import {
  SUGGESTION_CACHE_PORT,
  type SuggestionCachePort,
} from "@search/application/ports/search-cache.port";
import {
  SUGGESTION_INDEX_PORT,
  type SuggestionIndexPort,
} from "@search/application/ports/search-index.port";
import { SuggestSearchTerms } from "@search/application/suggestions/suggest-search-terms.use-case";
import { RedisSearchCacheAdapter } from "@search/infrastructure/cache/redis-search-cache.adapter";
import { SEARCH_CONFIG } from "@search/infrastructure/config/config.module";
import type { SearchConfig } from "@search/infrastructure/config/search-config";
import { PrismaService } from "@search/infrastructure/persistence/prisma/prisma.service";
import { PostgreSqlSearchIndexAdapter } from "@search/infrastructure/search/postgresql-search-index.adapter";
import { SuggestController } from "@search/interfaces/http/suggest.controller";

@Module({
  controllers: [SuggestController],
  providers: [
    {
      provide: SUGGESTION_INDEX_PORT,
      useFactory: (prisma: PrismaService): SuggestionIndexPort =>
        new PostgreSqlSearchIndexAdapter(prisma),
      inject: [PrismaService],
    },
    {
      provide: SUGGESTION_CACHE_PORT,
      useFactory: (config: SearchConfig): SuggestionCachePort =>
        new RedisSearchCacheAdapter(config),
      inject: [SEARCH_CONFIG],
    },
    {
      provide: SuggestSearchTerms,
      useFactory: (
        index: SuggestionIndexPort,
        cache: SuggestionCachePort,
        config: SearchConfig,
      ): SuggestSearchTerms =>
        new SuggestSearchTerms(
          index,
          cache,
          config.similarityThreshold,
          Math.min(config.suggestLimitMax, 20),
        ),
      inject: [SUGGESTION_INDEX_PORT, SUGGESTION_CACHE_PORT, SEARCH_CONFIG],
    },
  ],
})
export class SuggestionsModule {}
