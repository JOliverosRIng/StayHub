import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { SearchAccommodations } from "@search/application/search/search-accommodations.use-case";
import { createSearchQuery } from "@search/domain/search-query";
import type { SearchPage } from "@search/domain/search-result";
import { ServiceAuthGuard } from "./guards/service-auth.guard";
import { SearchQueryDto } from "./dto/search-query.dto";
import { ApiSearch } from "../openapi/search.openapi";
import { observeUseCase } from "@search/infrastructure/observability/otel";
import { recordResultCount } from "@search/infrastructure/observability/search-metrics";
@Controller("internal/v1/search")
@UseGuards(ServiceAuthGuard)
export class SearchController {
  public constructor(private readonly search: SearchAccommodations) {}
  @Get()
  @ApiSearch()
  public execute(@Query() dto: SearchQueryDto): Promise<SearchPage> {
    return observeUseCase("search", () => this.search.execute(createSearchQuery(dto))).then((page) => {
      recordResultCount("search", page.items.length);
      return page;
    });
  }
}
