import type { INestApplication } from '@nestjs/common';
import { ProblemFilter } from './problem.filter';
import { validationPipe } from './validation.pipe';
import { TraceInterceptor, traceMiddleware } from './trace.interceptor';
import { UsersLogger } from '@users/infrastructure/logging/users-logger';
export function configureHttp(app: INestApplication, logger = new UsersLogger()): void {
  app.use(traceMiddleware(logger));
  app.useGlobalFilters(new ProblemFilter());
  app.useGlobalPipes(validationPipe);
  app.useGlobalInterceptors(new TraceInterceptor());
}
