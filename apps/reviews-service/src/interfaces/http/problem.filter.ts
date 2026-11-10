import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from '@reviews/domain/shared/domain-error';

const statusByCode: Readonly<Record<string, number>> = { INVALID_RATING: 400, INVALID_COMMENT: 400, INVALID_REVIEW: 400, REVIEW_ALREADY_EXISTS: 409, BOOKING_NOT_ELIGIBLE: 404, DEPENDENCY_UNAVAILABLE: 503, SERVICE_CREDENTIALS_UNAVAILABLE: 503, FORBIDDEN: 403, NOT_FOUND: 404 };
export function problemStatusFor(code: string): number { return statusByCode[code] ?? 400; }

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  public catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<{ url: string; traceId?: string }>();
    const status = exception instanceof HttpException ? exception.getStatus() : exception instanceof DomainError ? problemStatusFor(exception.code) : HttpStatus.INTERNAL_SERVER_ERROR;
    const code = exception instanceof DomainError ? exception.code : exception instanceof HttpException ? (status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : status === 400 ? 'VALIDATION_ERROR' : `HTTP_${status}`) : 'INTERNAL_ERROR';
    const details = exception instanceof HttpException ? exception.getResponse() : undefined;
    const errors = typeof details === 'object' && details && 'errors' in details ? (details as { errors?: unknown[] }).errors ?? [] : [];
    response.status(status).type('application/problem+json').json({ type: `https://stayhub.dev/problems/${code.toLowerCase()}`, title: code, status, detail: status >= 500 ? 'The service could not complete the request.' : code, instance: request.url, code, traceId: request.traceId ?? 'unavailable', errors });
  }
}
