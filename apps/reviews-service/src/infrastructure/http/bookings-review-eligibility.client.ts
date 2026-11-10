import { Inject, Injectable } from '@nestjs/common';
import {
  SERVICE_TOKEN_PORT,
  type ServiceTokenPort,
} from '@reviews/application/ports/service-token.port';
import type {
  ReviewEligibility,
  StayEligibilityPort,
} from '@reviews/application/ports/stay-eligibility.port';
import { DomainError } from '@reviews/domain/shared/domain-error';
import { REVIEWS_CONFIG } from '@reviews/infrastructure/config/config.module';
import type { ReviewsConfig } from '@reviews/infrastructure/config/reviews-config';
import { mapReviewEligibility } from './bookings-eligibility.mapper';

@Injectable()
export class BookingsReviewEligibilityClient implements StayEligibilityPort {
  public constructor(
    @Inject(REVIEWS_CONFIG) private readonly config: ReviewsConfig,
    @Inject(SERVICE_TOKEN_PORT) private readonly tokens: ServiceTokenPort,
  ) {}

  public async getEligibility(
    bookingId: string,
    guestId: string,
    traceId: string,
  ): Promise<ReviewEligibility> {
    const token = await this.tokens.getToken();
    const url = `${this.config.bookingsBaseUrl}/internal/v1/bookings/${encodeURIComponent(bookingId)}/review-eligibility?guestId=${encodeURIComponent(guestId)}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(this.config.bookingsTimeoutMs),
        headers: { authorization: `Bearer ${token}`, 'x-request-id': traceId },
      });
    } catch {
      throw new DomainError('DEPENDENCY_UNAVAILABLE');
    }

    if (response.status === 404) throw new DomainError('BOOKING_NOT_ELIGIBLE');
    if (!response.ok) throw new DomainError('DEPENDENCY_UNAVAILABLE');

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new DomainError('DEPENDENCY_UNAVAILABLE');
    }

    return mapReviewEligibility(payload, { bookingId, guestId });
  }
}
