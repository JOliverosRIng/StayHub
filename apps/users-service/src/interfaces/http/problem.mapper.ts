import { HttpException } from '@nestjs/common';
import { DomainError, type FieldError } from '@users/domain/shared/domain-error';
import { isDatabaseUnavailable } from '@users/infrastructure/persistence/prisma/database-error';
const statuses = { VALIDATION_ERROR: 400, EMAIL_CONFLICT: 409, VERSION_CONFLICT: 409, STATE_CONFLICT: 409, IDEMPOTENCY_CONFLICT: 409, NOT_FOUND: 404, FORBIDDEN: 403, PHOTO_TOO_LARGE: 413, PHOTO_MEDIA_TYPE: 415, UNAVAILABLE: 503 } as const;
const titles: Record<number, string> = { 400: 'Invalid request', 401: 'Authentication required', 403: 'Access denied', 404: 'Resource not found', 409: 'Conflict', 413: 'Payload too large', 415: 'Unsupported media type', 500: 'Internal error', 503: 'Service unavailable' };
export interface Problem { type: string; title: string; status: number; detail: string; instance: string; code: string; traceId: string; errors: readonly FieldError[] }
export function mapProblem(error: unknown, traceId: string): Problem {
  const status = error instanceof DomainError ? statuses[error.code] : error instanceof HttpException ? error.getStatus() : isDatabaseUnavailable(error) ? 503 : 500;
  const title = titles[status] ?? 'Request failed';
  return { type: 'about:blank', title, status, detail: title, instance: `urn:request:${traceId}`, code: error instanceof DomainError ? error.code : `HTTP_${status}`, traceId, errors: error instanceof DomainError ? error.errors : [] };
}
