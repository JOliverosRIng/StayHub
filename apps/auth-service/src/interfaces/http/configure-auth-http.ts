import type { INestApplication } from '@nestjs/common';

import { AUTH_CONFIG, type AuthConfig } from '@auth/infrastructure/config/auth-config';
import { AuthLogger } from '@auth/infrastructure/observability/auth-logger';
import { mountAuthSwagger } from '@auth/interfaces/openapi/openapi.factory';
import { ProblemDetailsFilter } from './problem.filter';
import { TraceInterceptor } from './trace.interceptor';
import { traceMiddleware } from './trace.middleware';
import { createValidationPipe } from './validation.pipe';

export interface ConfigureAuthHttpOptions {
  readonly swagger?: boolean;
}

export function configureAuthHttp(
  app: INestApplication,
  options: ConfigureAuthHttpOptions = {},
): void {
  const config = app.get<AuthConfig>(AUTH_CONFIG);
  const logger = app.get(AuthLogger);
  app.useLogger(logger);
  app.use(traceMiddleware);
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalInterceptors(app.get(TraceInterceptor, { strict: false }));
  app.useGlobalFilters(new ProblemDetailsFilter(logger));
  if (options.swagger ?? true) mountAuthSwagger(app, config.environment);
}
