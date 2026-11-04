import type { INestApplication } from '@nestjs/common';
import { ProblemFilter } from './problem.filter';
import { traceMiddleware } from './trace.interceptor';
import { AccommodationsLogger } from '@accommodations/infrastructure/logging/accommodations-logger';
export function configureHttp(app: INestApplication, logger = new AccommodationsLogger()): void {
  app.use(traceMiddleware(logger));
  app.useGlobalFilters(new ProblemFilter());
}
