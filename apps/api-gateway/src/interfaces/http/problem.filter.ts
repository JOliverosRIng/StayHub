import { ArgumentsHost, Catch, ExceptionFilter, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';

import { mapProblem } from '@gateway/interfaces/http/problem.mapper';
import { traceIdFromRequest } from '@gateway/interfaces/http/trace-id';

@Catch()
@Injectable()
export class ProblemDetailsFilter implements ExceptionFilter {
  public catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const problem = mapProblem(exception, safeInstance(request), traceIdFromRequest(request));
    response.status(problem.status).type('application/problem+json').send(problem);
  }
}

function safeInstance(request: Request): string {
  const [path] = (request.originalUrl ?? request.url ?? '/').split('?');
  return path === undefined || path === '' ? '/' : path;
}
