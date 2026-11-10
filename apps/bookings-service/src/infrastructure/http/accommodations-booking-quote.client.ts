import { Inject, Injectable } from '@nestjs/common';
import { ACCOMMODATION_QUOTE_PORT, type AccommodationQuote, type AccommodationQuotePort } from '@bookings/application/ports/accommodation-quote.port';
import { SERVICE_TOKEN_PORT, type ServiceTokenPort } from '@bookings/application/ports/service-token.port';
import type { BookingsConfig } from '@bookings/infrastructure/config/bookings-config';
import { BOOKINGS_CONFIG } from '@bookings/infrastructure/config/config.module';
import { DomainError } from '@bookings/domain/shared/domain-error';
import { mapAccommodationQuote } from './accommodations-quote.mapper';

@Injectable()
export class AccommodationsBookingQuoteClient implements AccommodationQuotePort {
  public static readonly token = ACCOMMODATION_QUOTE_PORT;
  public constructor(@Inject(BOOKINGS_CONFIG) private readonly config: BookingsConfig, @Inject(SERVICE_TOKEN_PORT) private readonly tokens: ServiceTokenPort) {}
  public async getQuote(propertyId: string, roomId: string, guests: number, traceId?: string): Promise<AccommodationQuote> {
    const token = await this.tokens.getToken('accommodations-service', 'accommodations:booking-quote');
    let response: Response;
    try { response = await fetch(`${this.config.accommodationsUrl}/internal/v1/properties/${propertyId}/rooms/${roomId}/booking-quote?guests=${guests}`, { signal: AbortSignal.timeout(this.config.dependencyTimeoutMs), headers: { authorization: `Bearer ${token}`, ...(traceId ? { 'x-request-id': traceId } : {}) } }); }
    catch { throw new DomainError('DEPENDENCY_UNAVAILABLE'); }
    if (!response.ok) throw new DomainError(response.status === 404 ? 'ACCOMMODATION_NOT_FOUND' : response.status === 409 ? 'ACCOMMODATION_CONFLICT' : response.status >= 500 ? 'DEPENDENCY_UNAVAILABLE' : 'DEPENDENCY_REJECTED');
    return mapAccommodationQuote(await response.json());
  }
}
