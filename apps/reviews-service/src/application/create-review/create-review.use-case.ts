import type { ClockPort } from '@reviews/application/ports/clock.port';
import type { IdGeneratorPort } from '@reviews/application/ports/id-generator.port';
import type { ReviewUnitOfWork } from '@reviews/application/ports/review.unit-of-work';
import type { StayEligibilityPort } from '@reviews/application/ports/stay-eligibility.port';
import { Rating } from '@reviews/domain/reviews/rating';
import { Review } from '@reviews/domain/reviews/review';
import { ReviewComment } from '@reviews/domain/reviews/review-comment';
import { DomainError } from '@reviews/domain/shared/domain-error';

export interface CreateReviewCommand {
  bookingId: string;
  rating: number;
  comment: string;
  guestId: string;
  role?: string;
  traceId: string;
}

export class CreateReviewUseCase {
  public constructor(
    private readonly eligibility: StayEligibilityPort,
    private readonly reviews: ReviewUnitOfWork,
    private readonly clock: ClockPort,
    private readonly ids: IdGeneratorPort,
  ) {}

  public async execute(command: CreateReviewCommand): Promise<Review> {
    if (command.role !== 'GUEST') throw new DomainError('FORBIDDEN');

    const rating = Rating.create(command.rating);
    const comment = ReviewComment.create(command.comment);

    const eligibility = await this.eligibility.getEligibility(command.bookingId, command.guestId, command.traceId);
    if (!eligibility.eligible) throw new DomainError('BOOKING_NOT_ELIGIBLE');
    if (eligibility.bookingId !== command.bookingId || eligibility.guestId !== command.guestId) {
      throw new DomainError('BOOKING_NOT_ELIGIBLE');
    }

    const review = Review.create({
      id: this.ids.generate(),
      bookingId: command.bookingId,
      propertyId: eligibility.propertyId,
      guestId: command.guestId,
      rating: rating.value,
      comment: comment.value,
      createdAt: this.clock.now(),
    });

    return this.reviews.create(review);
  }
}
