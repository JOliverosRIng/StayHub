import { createHmac } from 'node:crypto';
import { DomainError } from '../../domain/shared/domain-error';

const MIN_HMAC_SECRET_LENGTH = 32;

/** Returns a keyed digest only; callers must never persist or log the raw token. */
export function tokenFingerprint(token: string, secret: string): string {
  if (typeof token !== 'string' || token.length === 0) {
    throw new DomainError('VALIDATION_ERROR', 'Payment token is required');
  }
  if (typeof secret !== 'string' || secret.length < MIN_HMAC_SECRET_LENGTH) {
    throw new DomainError('UNAVAILABLE', 'Payment token fingerprint secret is not configured safely');
  }
  return createHmac('sha256', secret).update(token, 'utf8').digest('hex');
}
