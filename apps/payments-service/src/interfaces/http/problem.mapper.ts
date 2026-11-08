import { randomBytes } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { isDatabaseUnavailable } from '../../infrastructure/persistence/prisma/database-error';
import { DomainError, type FieldError } from '../../domain/shared/domain-error';

const DOMAIN_STATUSES = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  IDEMPOTENCY_CONFLICT: 409,
  STATE_CONFLICT: 409,
  REFUND_AMOUNT_INVALID: 422,
  UNAVAILABLE: 503,
} as const;

const HTTP_CODES: Readonly<Record<number, string>> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'STATE_CONFLICT',
  422: 'REFUND_AMOUNT_INVALID',
  503: 'GATEWAY_UNAVAILABLE',
};

const TITLES: Readonly<Record<number, string>> = {
  400: 'Invalid request',
  401: 'Authentication required',
  403: 'Access denied',
  404: 'Resource not found',
  409: 'Conflict',
  422: 'Refund amount invalid',
  500: 'Internal error',
  503: 'Service unavailable',
};

export interface PaymentProblem {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance: string;
  readonly code: string;
  readonly traceId: string;
  readonly errors: readonly FieldError[];
}

export function mapPaymentProblem(error: unknown, traceId: string): PaymentProblem {
  const domainError = error instanceof DomainError ? error : null;
  const unavailable = isDatabaseUnavailable(error);
  const status = domainError
    ? DOMAIN_STATUSES[domainError.code]
    : unavailable
      ? 503
      : error instanceof HttpException
        ? error.getStatus()
        : 500;
  const safeStatus = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
  const normalizedTraceId = /^[0-9a-f]{32}$/.test(traceId) && !/^0+$/.test(traceId)
    ? traceId
    : randomBytes(16).toString('hex');
  const title = TITLES[safeStatus] ?? 'Request failed';
  const code = domainError
    ? domainError.code === 'UNAVAILABLE' ? 'GATEWAY_UNAVAILABLE' : domainError.code
    : unavailable
      ? 'GATEWAY_UNAVAILABLE'
      : HTTP_CODES[safeStatus] ?? 'INTERNAL_ERROR';

  return {
    type: 'about:blank',
    title,
    status: safeStatus,
    detail: title,
    instance: `urn:request:${normalizedTraceId}`,
    code,
    traceId: normalizedTraceId,
    errors: domainError?.fieldErrors ?? [],
  };
}
