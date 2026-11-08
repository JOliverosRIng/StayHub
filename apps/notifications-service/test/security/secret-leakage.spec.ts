import { redact } from '../../src/infrastructure/logging/notifications-logger';

describe('secret leakage protection (NTF-003)', () => {
  it('redacts nested body, email, token and key fields', () => {
    const safe = redact({ body: 'private text', email: 'a@b.test', authorization: 'Bearer x', nested: { privateKey: 'pem' }, status: 'SENT' });
    expect(JSON.stringify(safe)).not.toMatch(/private text|a@b\.test|Bearer x|pem/);
    expect(safe).toMatchObject({ body: '[REDACTED]', email: '[REDACTED]', authorization: '[REDACTED]', status: 'SENT' });
  });
});
