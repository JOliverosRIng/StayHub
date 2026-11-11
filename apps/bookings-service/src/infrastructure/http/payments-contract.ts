import { createHash } from 'node:crypto';
import { DomainError } from '@bookings/domain/shared/domain-error';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DECIMAL_AMOUNT = /^\d{1,10}(?:\.\d{1,2})?$/u;

export function toMinorUnits(amount: string): number {
  if (!DECIMAL_AMOUNT.test(amount)) throw new DomainError('DEPENDENCY_INVALID_RESPONSE');
  const [whole = '', fraction = ''] = amount.split('.');
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (minor <= 0n || minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new DomainError('DEPENDENCY_INVALID_RESPONSE');
  return Number(minor);
}

export function paymentsIdempotencyKey(key: string): string {
  if (UUID.test(key)) return key;
  const hex = createHash('sha256').update(key, 'utf8').digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ((Number.parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
}

export function mockPaymentToken(bookingId: string, override?: string): string {
  const token = override ?? `booking_${bookingId.replaceAll('-', '')}`;
  if (!/^(?!\d{13,19}$)[A-Za-z0-9_-]{8,64}$/u.test(token)) throw new DomainError('DEPENDENCY_INVALID_RESPONSE');
  return token;
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
