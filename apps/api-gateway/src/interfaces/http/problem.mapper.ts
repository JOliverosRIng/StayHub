import { HttpException, HttpStatus } from '@nestjs/common';

import { GatewayDependencyError } from '@gateway/application/errors/gateway-errors';

export interface FieldError {
  readonly field: string;
  readonly code: string;
  readonly message?: string;
}

export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance: string;
  readonly code: string;
  readonly traceId: string;
  readonly errors?: readonly FieldError[];
}

const PROBLEM_BASE = 'https://stayhub.example/problems/';
const GENERIC_DETAIL = 'The request is invalid';
const DEPENDENCY_DETAIL = 'A required service could not complete the request';

export function mapProblem(
  exception: unknown,
  instance: string,
  traceId: string,
): ProblemDetails {
  if (exception instanceof HttpException) return fromHttp(exception, instance, traceId);
  if (exception instanceof GatewayDependencyError) {
    return problem(503, 'DEPENDENCY_UNAVAILABLE', instance, traceId);
  }
  return problem(500, 'INTERNAL_ERROR', instance, traceId);
}

function fromHttp(exception: HttpException, instance: string, traceId: string): ProblemDetails {
  const status = exception.getStatus();
  const response = exception.getResponse();
  const object =
    typeof response === 'object' && response !== null ? (response as Record<string, unknown>) : {};
  return problem(
    status,
    readCode(object['code'], status),
    instance,
    traceId,
    readFieldErrors(object['errors']),
  );
}

function problem(
  status: number,
  code: string,
  instance: string,
  traceId: string,
  errors?: readonly FieldError[],
): ProblemDetails {
  return {
    type: `${PROBLEM_BASE}${kebab(code)}`,
    title: titleFor(status),
    status,
    detail: detailFor(status),
    instance,
    code,
    traceId,
    ...(errors === undefined ? {} : { errors }),
  };
}

function readCode(value: unknown, status: number): string {
  return typeof value === 'string' && value !== '' ? value : `HTTP_${status}`;
}

function readFieldErrors(value: unknown): readonly FieldError[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(isFieldError);
}

function isFieldError(value: unknown): value is FieldError {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate['field'] !== 'string' || candidate['field'] === '') return false;
  if (typeof candidate['code'] !== 'string' || candidate['code'] === '') return false;
  const message = candidate['message'];
  return message === undefined || typeof message === 'string';
}

function kebab(code: string): string {
  return code.toLowerCase().replaceAll('_', '-');
}

function titleFor(status: number): string {
  const name: string | undefined = HttpStatus[status];
  return name === undefined ? 'Request failed' : name.replaceAll('_', ' ');
}

function detailFor(status: number): string {
  return status >= 500 ? DEPENDENCY_DETAIL : GENERIC_DETAIL;
}
