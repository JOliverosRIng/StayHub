import { HttpException } from '@nestjs/common';
import { DomainError } from '../../src/domain/shared/domain-error';
import { mapPaymentProblem } from '../../src/interfaces/http/problem.mapper';

describe('mapPaymentProblem', () => {
  it.each([
    ['VALIDATION_ERROR', 400, 'VALIDATION_ERROR'],
    ['NOT_FOUND', 404, 'NOT_FOUND'],
    ['FORBIDDEN', 403, 'FORBIDDEN'],
    ['IDEMPOTENCY_CONFLICT', 409, 'IDEMPOTENCY_CONFLICT'],
    ['STATE_CONFLICT', 409, 'STATE_CONFLICT'],
    ['REFUND_AMOUNT_INVALID', 422, 'REFUND_AMOUNT_INVALID'],
    ['UNAVAILABLE', 503, 'GATEWAY_UNAVAILABLE'],
  ] as const)('maps %s to status %i and code %s', (code, status, publicCode) => {
    const problem = mapPaymentProblem(new DomainError(code, 'safe message'), 'a'.repeat(32));
    expect(problem.status).toBe(status);
    expect(problem.code).toBe(publicCode);
    expect(problem.type).toBe('about:blank');
    expect(problem.traceId).toBe('a'.repeat(32));
  });

  it('maps validation errors and never leaks unknown exception messages', () => {
    const validation = new DomainError('VALIDATION_ERROR', 'Invalid payment', [
      { field: 'amountMinor', message: 'Must be positive' },
    ]);
    expect(mapPaymentProblem(validation, 'b'.repeat(32)).errors).toEqual([
      { field: 'amountMinor', message: 'Must be positive' },
    ]);
    const unknown = mapPaymentProblem(new Error('secret token value'), 'c'.repeat(32));
    expect(unknown.status).toBe(500);
    expect(unknown.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(unknown)).not.toContain('secret token value');
  });

  it('maps Nest HTTP errors to stable public problem codes', () => {
    const problem = mapPaymentProblem(new HttpException('sensitive internal text', 401), 'd'.repeat(32));
    expect(problem.status).toBe(401);
    expect(problem.code).toBe('UNAUTHENTICATED');
    expect(problem.detail).not.toContain('sensitive internal text');
  });
});
