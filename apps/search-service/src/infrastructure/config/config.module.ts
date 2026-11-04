import { Global, Module } from "@nestjs/common";
import { loadSearchConfig, type SearchConfig } from "./search-config";

export const SEARCH_CONFIG = Symbol("SEARCH_CONFIG");
@Global()
@Module({
  providers: [
    {
      provide: SEARCH_CONFIG,
      useFactory: (): SearchConfig => loadSearchConfig(),
    },
  ],
  exports: [SEARCH_CONFIG],
})
export class SearchConfigModule {}
