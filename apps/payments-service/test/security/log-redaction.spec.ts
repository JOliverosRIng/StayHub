import { PaymentsLogger } from '../../src/infrastructure/logging/payments-logger';

describe('PaymentsLogger security redaction', () => {
  it('redacts sensitive keys recursively and card-like digit strings', () => {
    const records: unknown[] = [];
    const logger = new PaymentsLogger((record) => records.push(record));
    logger.event('payment.request', {
      token: 'tok_super_secret_token',
      nested: {
        authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.secret.signature',
        paymentMethod: { number: '4111111111111111', token: 'another_secret' },
        'Idempotency-Key': 'secret-idempotency-value',
      },
      message: 'card number 4111111111111111 is invalid',
    });

    const serialized = JSON.stringify(records);
    for (const secret of [
      'tok_super_secret_token',
      'eyJhbGciOiJIUzI1NiJ9.secret.signature',
      '4111111111111111',
      'another_secret',
      'secret-idempotency-value',
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(serialized).toContain('[REDACTED]');
  });

  it('writes safe JSON records and handles circular objects and errors', () => {
    const records: unknown[] = [];
    const logger = new PaymentsLogger((record) => records.push(record));
    const circular: { child?: unknown } = {};
    circular.child = circular;
    expect(() => logger.log({ circular, error: new Error('PAN 5555555555554444') }, 'test-context')).not.toThrow();
    expect(JSON.stringify(records)).not.toContain('5555555555554444');
    expect(records[0]).toMatchObject({ service: 'payments-service', level: 'info', context: 'test-context' });
  });
});
