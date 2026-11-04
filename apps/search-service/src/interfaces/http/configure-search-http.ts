import type { INestApplication } from '@nestjs/common';
import { ProblemFilter } from './problem.filter';
import { createSearchValidationPipe } from './validation.pipe';
import { observeHttp } from '@search/infrastructure/observability/http-observability';
import type { SearchLogger } from '@search/infrastructure/observability/search-logger';
export function configureSearchHttp(app: INestApplication, logger: SearchLogger): void {
  app.use(observeHttp(logger));
  app.useGlobalFilters(new ProblemFilter());
  app.useGlobalPipes(createSearchValidationPipe());
}
