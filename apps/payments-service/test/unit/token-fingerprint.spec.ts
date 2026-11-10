import { createHmac } from 'node:crypto';
import { tokenFingerprint } from '../../src/infrastructure/security/token-fingerprint';

describe('token fingerprint', () => {
  const token = 'opaque_payment_token_123456';
  const secret = 'test-secret-that-is-longer-than-thirty-two-characters';

  it('creates a deterministic HMAC-SHA-256 using the configured secret', () => {
    const expected = createHmac('sha256', secret).update(token, 'utf8').digest('hex');
    expect(tokenFingerprint(token, secret)).toBe(expected);
    expect(tokenFingerprint(token, secret)).toBe(tokenFingerprint(token, secret));
  });

  it('does not include the clear token and changes when the secret changes', () => {
    const fingerprint = tokenFingerprint(token, secret);
    expect(fingerprint).not.toContain(token);
    expect(fingerprint).not.toBe(token);
    expect(tokenFingerprint(token, `${secret}-different`)).not.toBe(fingerprint);
  });

  it('rejects an empty token or a weak secret', () => {
    expect(() => tokenFingerprint('', secret)).toThrow();
    expect(() => tokenFingerprint(token, 'short')).toThrow();
  });
});
