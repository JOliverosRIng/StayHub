import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ProblemFilter } from './problem.filter';
import { traceMiddleware } from './trace.middleware';

export function configureHttp(app: INestApplication): void {
  app.use(traceMiddleware);
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    transformOptions: { enableImplicitConversion: false },
  }));
  app.useGlobalFilters(new ProblemFilter());
}
