import { DomainError } from '@bookings/domain/shared/domain-error';
import type { AccommodationQuote } from '@bookings/application/ports/accommodation-quote.port';

export function mapAccommodationQuote(value: unknown): AccommodationQuote {
  if (!value || typeof value !== 'object') throw new DomainError('DEPENDENCY_INVALID_RESPONSE');
  const row = value as Record<string, unknown>; const price = row.basePrice as Record<string, unknown> | undefined;
  if (row.propertyStatus !== 'PUBLISHED' || !Number.isSafeInteger(row.capacity) || Number(row.capacity) < 1 || !Number.isSafeInteger(row.propertyVersion) || Number(row.propertyVersion) < 1 || !price || typeof price.amount !== 'string' || typeof price.currency !== 'string') throw new DomainError('DEPENDENCY_INVALID_RESPONSE');
  return value as AccommodationQuote;
}
