import { ArgumentsHost, Catch, ExceptionFilter, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';

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
    const problem = mapProblem(exception, request.originalUrl, traceId);
    this.logger.error('http_request_failed', { code: problem.code, status: problem.status, exception });
    response.status(problem.status).type('application/problem+json').send(problem);
  }
}

