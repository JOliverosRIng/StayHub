import { Injectable } from '@nestjs/common';
import type {
  ReviewPageQuery,
  ReviewRepository,
} from '@reviews/application/ports/review.repository';
import { Review } from '@reviews/domain/reviews/review';
import type { Review as PrismaReview } from '../generated/client';
import { PrismaService } from './prisma.service';

export function mapReviewRow(row: PrismaReview): Review {
  return Review.create({
    id: row.id,
    bookingId: row.bookingId,
    propertyId: row.propertyId,
    guestId: row.guestId,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.createdAt,
  });
}

function pagination(page: ReviewPageQuery): Readonly<{ skip: number; take: number }> {
  return { skip: (page.page - 1) * page.pageSize, take: page.pageSize };
}

@Injectable()
export class PrismaReviewRepository implements ReviewRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findByBookingId(bookingId: string): Promise<Review | null> {
    const row = await this.prisma.review.findUnique({ where: { bookingId } });
    return row ? mapReviewRow(row) : null;
  }

  public async findByPropertyId(propertyId: string, page: ReviewPageQuery): Promise<Review[]> {
    const rows = await this.prisma.review.findMany({
      where: { propertyId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...pagination(page),
    });
    return rows.map(mapReviewRow);
  }

  public countByPropertyId(propertyId: string): Promise<number> {
    return this.prisma.review.count({ where: { propertyId } });
  }

  public async findByGuestId(guestId: string, page: ReviewPageQuery): Promise<Review[]> {
    const rows = await this.prisma.review.findMany({
      where: { guestId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...pagination(page),
    });
    return rows.map(mapReviewRow);
  }

  public countByGuestId(guestId: string): Promise<number> {
    return this.prisma.review.count({ where: { guestId } });
  }
}
