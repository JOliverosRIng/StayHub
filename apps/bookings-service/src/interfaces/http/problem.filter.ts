import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from '@bookings/domain/shared/domain-error';

const statusByCode: Readonly<Record<string, number>> = { VALIDATION_ERROR: 400, IDEMPOTENCY_CONFLICT: 409, IDEMPOTENCY_IN_PROGRESS: 409, BOOKING_CONFLICT: 409, ACCOMMODATION_CONFLICT: 409, DEPENDENCY_UNAVAILABLE: 503, SERVICE_CREDENTIALS_UNAVAILABLE: 503, STATE_CONFLICT: 409, NOT_FOUND: 404, ACCOMMODATION_NOT_FOUND: 404, FORBIDDEN: 403 };
export function domainProblemStatus(code: string): number { return statusByCode[code] ?? 400; }

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  public catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<{ url: string; traceId?: string }>();
    const status = exception instanceof HttpException ? exception.getStatus() : exception instanceof DomainError ? domainProblemStatus(exception.code) : HttpStatus.INTERNAL_SERVER_ERROR;
    const code = exception instanceof DomainError ? exception.code : exception instanceof HttpException ? `HTTP_${status}` : 'INTERNAL_ERROR';
    response.status(status).type('application/problem+json').json({ type: `https://stayhub.dev/problems/${code.toLowerCase()}`, title: code, status, code, instance: request.url, traceId: request.traceId });
  }
}
