import { HttpException, HttpStatus } from '@nestjs/common';

import { ApplicationError, DependencyUnavailableError, IdempotencyConflictError, InvalidCredentialsError, LoginRateLimitError, RefreshTokenInvalidError, SessionInvalidError } from '@auth/application/errors/auth-errors';
import { DomainError } from '@auth/domain/shared/domain-error';

export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance: string;
  readonly code: string;
  readonly traceId: string;
  readonly errors?: readonly string[];
}

export function mapProblem(
  exception: unknown,
  instance: string,
  traceId: string,
): ProblemDetails {
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const response = exception.getResponse();
    const object = typeof response === 'object' && response !== null ? response as Record<string, unknown> : {};
    const errors = Array.isArray(object.errors)
      ? object.errors.filter((value): value is string => typeof value === 'string')
      : undefined;
    const code = typeof object.code === 'string' ? object.code : httpCode(status);
    return problem(status, code, safeTitle(status), safeDetail(status), instance, traceId, errors);
  }
  if (exception instanceof DomainError) {
    return problem(400, exception.code, 'Invalid request', exception.message, instance, traceId);
  }
  if (exception instanceof ApplicationError) {
    const status = applicationStatus(exception);
    return problem(status, exception.code, safeTitle(status), exception.safeDetail, instance, traceId);
  }
  return problem(500, 'INTERNAL_ERROR', 'Internal Server Error', 'The request could not be completed', instance, traceId);
}

function applicationStatus(error: ApplicationError): number {
  if (error instanceof InvalidCredentialsError || error instanceof SessionInvalidError || error instanceof RefreshTokenInvalidError) return 401;
  if (error instanceof IdempotencyConflictError) return 409;
  if (error instanceof LoginRateLimitError) return 429;
  if (error instanceof DependencyUnavailableError) return 503;
  return 400;
}

function problem(
  status: number,
  code: string,
  title: string,
  detail: string,
  instance: string,
  traceId: string,
  errors?: readonly string[],
): ProblemDetails {
  return {
    type: `https://stayhub.example/problems/${code.toLowerCase().replaceAll('_', '-')}`,
    title,
    status,
    detail,
    instance,
    code,
    traceId,
    ...(errors === undefined ? {} : { errors }),
  };
}

function safeTitle(status: number): string {
  return HttpStatus[status]?.toString().replaceAll('_', ' ') ?? 'Request failed';
}

function safeDetail(status: number): string {
  return status >= 500 ? 'A required service could not complete the request' : 'The request is invalid';
}

function httpCode(status: number): string {
  return `HTTP_${status}`;
}
