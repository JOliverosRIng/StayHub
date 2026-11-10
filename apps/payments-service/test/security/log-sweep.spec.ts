import { PaymentsLogger } from '../../src/infrastructure/logging/payments-logger';

const SENSITIVE_PATTERNS = [
  /\bBearer\s+(?!\[REDACTED\])[A-Za-z0-9._~+/-]+=*/i,
  /\btok_[A-Za-z0-9_-]{4,}\b/,
  /(?<!\d)\d{13,19}(?!\d)/,
  /\bAuthorization\b["']?\s*[:=]\s*["']?(?!["']?\[REDACTED\])[^,\s}\]]+/i,
  /\b(?:Idempotency-Key|idempotencyKey)\b["']?\s*[:=]\s*["']?(?!["']?\[REDACTED\])(?:[0-9a-f-]{16,}|[^,\s}\]]+)/i,
];

function hasSensitiveLogData(logs: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(logs));
}

describe('Payments integration log sweep', () => {
  it('detects bearer credentials, mock tokens, idempotency keys and PAN patterns', () => {
    const unsafe = [
      'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.secret.signature',
      'token=tok_super_secret_value',
      'Idempotency-Key: 4792ae00-9044-4cb8-8abd-2829c0d3ca91',
      'card=4111111111111111',
    ].join('\n');
    expect(hasSensitiveLogData(unsafe)).toBe(true);
  });

  it('sweeps sanitized payment logs and confirms sensitive values are absent', () => {
    const records: unknown[] = [];
    const logger = new PaymentsLogger((record) => records.push(record));
    logger.event('payments.test.request', {
      authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.secret.signature',
      token: 'tok_super_secret_value',
      idempotencyKey: '4792ae00-9044-4cb8-8abd-2829c0d3ca91',
      message: 'PAN 4111111111111111 rejected',
    });
    const captured = JSON.stringify(records);
    expect(hasSensitiveLogData(captured)).toBe(false);
    expect(captured).not.toMatch(/eyJhbGci|tok_super|4792ae00|4111111111111111/);
  });
});
