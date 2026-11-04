import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { SuggestSearchTerms } from "@search/application/suggestions/suggest-search-terms.use-case";
import { createSuggestionQuery } from "@search/domain/suggestion";
import type { SuggestionResponse } from "@search/domain/suggestion";
import { ApiSuggest } from "../openapi/suggest.openapi";
import { SuggestQueryDto } from "./dto/suggest-query.dto";
import { ServiceAuthGuard } from "./guards/service-auth.guard";
import { observeUseCase } from "@search/infrastructure/observability/otel";
import { recordResultCount } from "@search/infrastructure/observability/search-metrics";

@Controller("internal/v1/search")
@UseGuards(ServiceAuthGuard)
export class SuggestController {
  public constructor(private readonly suggestions: SuggestSearchTerms) {}

  @Get("suggest")
  @ApiSuggest()
  public execute(@Query() dto: SuggestQueryDto): Promise<SuggestionResponse> {
    return observeUseCase("suggest", () => this.suggestions.execute(createSuggestionQuery(dto))).then((response) => {
      recordResultCount("suggest", response.items.length);
      return response;
    });
  }
}
