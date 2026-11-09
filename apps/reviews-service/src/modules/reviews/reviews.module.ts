import { Module } from '@nestjs/common';
import { CreateReviewUseCase } from '@reviews/application/create-review/create-review.use-case';
import { ListPropertyReviewsUseCase } from '@reviews/application/list-property-reviews/list-property-reviews.use-case';
import { ListOwnReviewsUseCase } from '@reviews/application/list-user-reviews/list-own-reviews.use-case';
import { CLOCK_PORT, type ClockPort } from '@reviews/application/ports/clock.port';
import {
  ID_GENERATOR_PORT,
  type IdGeneratorPort,
} from '@reviews/application/ports/id-generator.port';
import {
  REVIEW_REPOSITORY,
  type ReviewRepository,
} from '@reviews/application/ports/review.repository';
import {
  REVIEW_UNIT_OF_WORK,
  type ReviewUnitOfWork,
} from '@reviews/application/ports/review.unit-of-work';
import {
  STAY_ELIGIBILITY_PORT,
  type StayEligibilityPort,
} from '@reviews/application/ports/stay-eligibility.port';
import { BookingsReviewEligibilityClient } from '@reviews/infrastructure/http/bookings-review-eligibility.client';
import { PrismaReviewRepository } from '@reviews/infrastructure/persistence/prisma/review.repository';
import { PrismaReviewUnitOfWork } from '@reviews/infrastructure/persistence/prisma/review.unit-of-work';
import { PropertyReviewsController } from '@reviews/interfaces/http/reviews/property-reviews.controller';
import { ReviewsController } from '@reviews/interfaces/http/reviews/reviews.controller';
import { UserReviewsController } from '@reviews/interfaces/http/reviews/user-reviews.controller';

@Module({
  controllers: [ReviewsController, PropertyReviewsController, UserReviewsController],
  providers: [
    PrismaReviewRepository,
    PrismaReviewUnitOfWork,
    BookingsReviewEligibilityClient,
    { provide: REVIEW_REPOSITORY, useExisting: PrismaReviewRepository },
    { provide: REVIEW_UNIT_OF_WORK, useExisting: PrismaReviewUnitOfWork },
    { provide: STAY_ELIGIBILITY_PORT, useExisting: BookingsReviewEligibilityClient },
    {
      provide: CreateReviewUseCase,
      inject: [STAY_ELIGIBILITY_PORT, REVIEW_UNIT_OF_WORK, CLOCK_PORT, ID_GENERATOR_PORT],
      useFactory: (
        eligibility: StayEligibilityPort,
        reviews: ReviewUnitOfWork,
        clock: ClockPort,
        ids: IdGeneratorPort,
      ): CreateReviewUseCase => new CreateReviewUseCase(eligibility, reviews, clock, ids),
    },
    {
      provide: ListPropertyReviewsUseCase,
      inject: [REVIEW_REPOSITORY],
      useFactory: (reviews: ReviewRepository): ListPropertyReviewsUseCase =>
        new ListPropertyReviewsUseCase(reviews),
    },
    {
      provide: ListOwnReviewsUseCase,
      inject: [REVIEW_REPOSITORY],
      useFactory: (reviews: ReviewRepository): ListOwnReviewsUseCase =>
        new ListOwnReviewsUseCase(reviews),
    },
  ],
})
export class ReviewsModule {}
