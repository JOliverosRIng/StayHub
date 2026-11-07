import { DomainError } from '@reviews/domain/shared/domain-error';
import { Rating } from './rating';
import { ReviewComment } from './review-comment';

export interface ReviewSnapshot { id: string; bookingId: string; propertyId: string; guestId: string; rating: number; comment: string; createdAt: Date; }

export class Review {
  public readonly id: string;
  public readonly bookingId: string;
  public readonly propertyId: string;
  public readonly guestId: string;
  public readonly rating: Rating;
  public readonly comment: ReviewComment;
  public readonly createdAt: Date;

  private constructor(snapshot: ReviewSnapshot) {
    if (![snapshot.id, snapshot.bookingId, snapshot.propertyId, snapshot.guestId].every((value) => value.trim().length > 0)) throw new DomainError('INVALID_REVIEW');
    if (!(snapshot.createdAt instanceof Date) || Number.isNaN(snapshot.createdAt.getTime())) throw new DomainError('INVALID_REVIEW');
    this.id = snapshot.id; this.bookingId = snapshot.bookingId; this.propertyId = snapshot.propertyId; this.guestId = snapshot.guestId;
    this.rating = Rating.create(snapshot.rating); this.comment = ReviewComment.create(snapshot.comment); this.createdAt = new Date(snapshot.createdAt.getTime());
    Object.freeze(this);
  }

  public static create(snapshot: ReviewSnapshot): Review { return new Review(snapshot); }
  public toSnapshot(): ReviewSnapshot { return Object.freeze({ id: this.id, bookingId: this.bookingId, propertyId: this.propertyId, guestId: this.guestId, rating: this.rating.value, comment: this.comment.value, createdAt: new Date(this.createdAt.getTime()) }); }
}
