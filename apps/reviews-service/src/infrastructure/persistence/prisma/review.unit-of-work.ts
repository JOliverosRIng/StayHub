import { Injectable } from '@nestjs/common';
import type { ReviewUnitOfWork } from '@reviews/application/ports/review.unit-of-work';
import type { Review } from '@reviews/domain/reviews/review';
import { DomainError } from '@reviews/domain/shared/domain-error';
import { Prisma } from '../generated/client';
import { PrismaService } from './prisma.service';
import { mapReviewRow } from './review.repository';

@Injectable()
export class PrismaReviewUnitOfWork implements ReviewUnitOfWork {
  public constructor(private readonly prisma: PrismaService) {}

  public async create(review: Review): Promise<Review> {
    const snapshot = review.toSnapshot();
    try {
      const row = await this.prisma.review.create({
        data: {
          id: snapshot.id,
          bookingId: snapshot.bookingId,
          propertyId: snapshot.propertyId,
          guestId: snapshot.guestId,
          rating: snapshot.rating,
          comment: snapshot.comment,
          createdAt: snapshot.createdAt,
        },
      });
      return mapReviewRow(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DomainError('REVIEW_ALREADY_EXISTS');
      }
      throw error;
    }
  }
}
