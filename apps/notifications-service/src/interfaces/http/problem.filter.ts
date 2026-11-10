import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { traceId?: string }>();
    const response = http.getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const safe = exception instanceof HttpException ? exception.getResponse() : undefined;
    const detail = typeof safe === 'string' ? safe : 'The request could not be completed.';
    const errors = typeof safe === 'object' && safe !== null && 'message' in safe && Array.isArray(safe.message)
      ? safe.message.map((item) => ({ field: 'request', code: String(item).slice(0, 100) }))
      : [];
    const code = status === 400 ? 'BAD_REQUEST' : status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : status === 409 ? 'CONFLICT' : status === 503 ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_ERROR';
    response.status(status).type('application/problem+json').json({
      type: `https://stayhub.example/problems/${code.toLowerCase()}`,
      title: HttpStatus[status] ?? 'Error', status,
      detail: status >= 500 ? 'The request could not be completed.' : detail,
      instance: request.originalUrl,
      code,
      traceId: request.traceId ?? 'unavailable',
      errors,
    });
  }
}
