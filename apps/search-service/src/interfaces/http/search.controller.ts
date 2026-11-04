import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SearchAccommodations } from '@search/application/search/search-accommodations.use-case';
import { createSearchQuery } from '@search/domain/search-query';
import type { SearchPage } from '@search/domain/search-result';
import { ServiceAuthGuard } from './guards/service-auth.guard';
import { SearchQueryDto } from './dto/search-query.dto';
import { ApiSearch } from '../openapi/search.openapi';
@Controller('internal/v1/search')
@UseGuards(ServiceAuthGuard)
export class SearchController {
  public constructor(private readonly search: SearchAccommodations) {}
  @Get() @ApiSearch()
  public execute(@Query() dto: SearchQueryDto): Promise<SearchPage> { return this.search.execute(createSearchQuery(dto)); }
}
