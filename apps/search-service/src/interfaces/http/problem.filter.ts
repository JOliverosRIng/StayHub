import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { SearchApplicationError } from '@search/application/errors/search-errors';

@Catch()
export class ProblemFilter implements ExceptionFilter {
  public catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request & { traceId?: string }>();
    const known = error instanceof SearchApplicationError;
    const status = known ? error.status : error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const code = known ? error.code : status === 400 ? 'SEARCH_VALIDATION_FAILED' : 'SEARCH_INTERNAL_ERROR';
    const detail = status >= 500 ? 'The service could not complete the request.' : error instanceof Error ? error.message : 'Request failed.';
    response.status(status).type('application/problem+json').send({
      type: `https://stayhub.local/problems/${code.toLowerCase().replaceAll('_', '-')}`,
      title: status >= 500 ? 'Service error' : 'Request rejected', status, detail, instance: request.url, code,
      traceId: request.traceId ?? 'unavailable', errors: known ? error.errors : [],
    });
  }
}
