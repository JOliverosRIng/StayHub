import { ArgumentsHost, Catch, ExceptionFilter, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';

import { LoginRateLimitError } from '@auth/application/errors/auth-errors';
import { AuthLogger } from '@auth/infrastructure/observability/auth-logger';
import { traceIdFromRequest } from './trace.interceptor';
import { mapProblem } from './problem.mapper';

@Catch()
@Injectable()
export class ProblemDetailsFilter implements ExceptionFilter {
  public constructor(private readonly logger: AuthLogger) {}

  public catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const traceId = traceIdFromRequest(request);
    const problem = mapProblem(exception, safeInstance(request), traceId);
    this.logger.error('http_request_failed', {
      code: problem.code,
      status: problem.status,
      traceId,
    });
    if (exception instanceof LoginRateLimitError) {
      response.setHeader('Retry-After', String(Math.max(1, Math.ceil(exception.retryAfterSeconds))));
    }
    response.status(problem.status).type('application/problem+json').send(problem);
  }
}

function safeInstance(request: Request): string {
  const [path] = (request.originalUrl ?? request.url ?? '/').split('?');
  return path === undefined || path === '' ? '/' : path;
}

