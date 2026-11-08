import type { INestApplication } from '@nestjs/common';
import { json, urlencoded, type ErrorRequestHandler } from 'express';
import { mapPaymentProblem } from './problem.mapper';
import { ProblemFilter } from './problem.filter';
import { PaymentsValidationPipe } from './validation.pipe';
import { TraceInterceptor, traceMiddleware, type PaymentTraceRequest } from './trace.interceptor';

export const MAX_HTTP_BODY_BYTES = 8 * 1024;

const parserErrorHandler: ErrorRequestHandler = (error, request, response, next): void => {
  if (response.headersSent) {
    next(error);
    return;
  }
  const traceRequest = request as PaymentTraceRequest;
  const traceId = traceRequest.traceId ?? '';
  const problem = mapPaymentProblem(error, traceId);
  response.setHeader('x-trace-id', problem.traceId);
  response.setHeader('Cache-Control', 'no-store');
  response.status(problem.status).type('application/problem+json').json(problem);
};

export function configureHttp(app: INestApplication): void {
  app.use(traceMiddleware());
  app.use(json({ limit: MAX_HTTP_BODY_BYTES, strict: true }));
  app.use(urlencoded({ extended: false, limit: MAX_HTTP_BODY_BYTES, parameterLimit: 100 }));
  app.use(parserErrorHandler);
  app.useGlobalPipes(new PaymentsValidationPipe());
  app.useGlobalFilters(new ProblemFilter());
  app.useGlobalInterceptors(new TraceInterceptor());
}
