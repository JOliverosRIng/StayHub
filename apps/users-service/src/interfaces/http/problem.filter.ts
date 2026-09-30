import { ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { mapProblem } from './problem.mapper';
import { requestTrace, type UsersRequest } from './trace.interceptor';
@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const problem = mapProblem(error, requestTrace(http.getRequest<UsersRequest>()));
    response.setHeader('x-trace-id', problem.traceId);
    response.setHeader('Cache-Control', 'no-store');
    response.status(problem.status).type('application/problem+json').json(problem);
  }
}
