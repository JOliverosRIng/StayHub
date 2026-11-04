import { HttpException } from '@nestjs/common';
import { DomainError, type ErrorCode, type FieldError } from '@accommodations/domain/shared/domain-error';
import { isDatabaseUnavailable } from '@accommodations/infrastructure/persistence/prisma/database-error';

const statuses: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400, VERSION_CONFLICT: 409, PUBLICATION_INCOMPLETE: 409, PHOTO_LIMIT_REACHED: 409, STATE_CONFLICT: 409,
  NOT_FOUND: 404, FORBIDDEN: 403, PHOTO_TOO_LARGE: 413, PHOTO_MEDIA_TYPE: 415, UNAVAILABLE: 503,
};
const titles: Record<number, string> = {
  400: 'Invalid request', 401: 'Authentication required', 403: 'Access denied', 404: 'Resource not found', 409: 'Conflict',
  413: 'Payload too large', 415: 'Unsupported media type', 500: 'Internal error', 503: 'Service unavailable',
};
export interface Problem { type: string; title: string; status: number; detail: string; instance: string; code: string; traceId: string; errors: readonly FieldError[] }

const BODY_PARSER_ERRORS = ['entity.parse.failed', 'entity.too.large', 'encoding.unsupported', 'charset.unsupported', 'request.size.invalid', 'request.aborted'];
function isBodyParseError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && BODY_PARSER_ERRORS.includes(String((error as { type?: unknown }).type));
}

function classify(error: unknown): { status: number; code: string; errors: readonly FieldError[] } {
  if (error instanceof DomainError) return { status: statuses[error.code], code: error.code, errors: error.errors };
  if ((error as { code?: unknown } | null)?.code === 'LIMIT_FILE_SIZE' || (error instanceof HttpException && error.getStatus() === 413)) {
    return { status: 413, code: 'PHOTO_TOO_LARGE', errors: [] };
  }
  if (isBodyParseError(error) || (error instanceof HttpException && error.getStatus() === 400)) return { status: 400, code: 'VALIDATION_ERROR', errors: [{ field: 'body', code: 'INVALID_VALUE' }] };
  if (error instanceof HttpException) return { status: error.getStatus(), code: `HTTP_${error.getStatus()}`, errors: [] };
  if (isDatabaseUnavailable(error)) return { status: 503, code: 'UNAVAILABLE', errors: [] };
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === 'number' && [400, 413, 415].includes(status)) return { status, code: `HTTP_${status}`, errors: [] };
  return { status: 500, code: 'HTTP_500', errors: [] };
}

export function mapProblem(error: unknown, traceId: string): Problem {
  const { status, code, errors } = classify(error);
  const title = titles[status] ?? 'Request failed';
  return { type: 'about:blank', title, status, detail: title, instance: `urn:request:${traceId}`, code, traceId, errors };
}
