import { DomainError, type DomainErrorCode, type FieldError } from '../../../src/domain/shared/domain-error';

describe('DomainError', () => {
  it('preserves a stable code and message', () => {
    const error = new DomainError('NOT_FOUND', 'Payment was not found');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('DomainError');
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('Payment was not found');
  });

  it('stores field errors in the contract shape', () => {
    const fields: FieldError[] = [{ field: 'amount', message: 'Must be positive' }];
    const error = new DomainError('VALIDATION_ERROR', 'Invalid payment', fields);

    expect(error.fieldErrors).toEqual(fields);
    expect(error.fieldErrors).not.toBe(fields);
  });

  it.each<DomainErrorCode>([
    'VALIDATION_ERROR',
    'NOT_FOUND',
    'FORBIDDEN',
    'IDEMPOTENCY_CONFLICT',
    'STATE_CONFLICT',
    'REFUND_AMOUNT_INVALID',
    'UNAVAILABLE',
  ])('accepts stable code %s', (code) => {
    expect(new DomainError(code, 'Domain failure').code).toBe(code);
  });
});
