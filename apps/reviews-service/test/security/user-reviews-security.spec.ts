import { type INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { ListOwnReviewsUseCase } from '@reviews/application/list-user-reviews/list-own-reviews.use-case';
import type { ReviewRepository } from '@reviews/application/ports/review.repository';
import { Review } from '@reviews/domain/reviews/review';
import { UserJwtVerifier } from '@reviews/infrastructure/security/user-jwt.verifier';
import { UserAuthGuard } from '@reviews/interfaces/http/guards/user-auth.guard';
import { ProblemDetailsFilter } from '@reviews/interfaces/http/problem.filter';
import { TraceInterceptor } from '@reviews/interfaces/http/trace.interceptor';
import { UserReviewsController } from '@reviews/interfaces/http/reviews/user-reviews.controller';
import { ClosedValidationPipe } from '@reviews/interfaces/http/validation.pipe';

const GUEST = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const ADMIN = '00000000-0000-4000-8000-000000000003';
const PROPERTY = '00000000-0000-4000-8000-000000000004';
const BOOKING = '00000000-0000-4000-8000-000000000005';
const REVIEW_ID = '00000000-0000-4000-8000-000000000006';
const NOW = new Date('2026-01-01T00:00:00.000Z');

function review(): Review {
  return Review.create({
    id: REVIEW_ID,
    bookingId: BOOKING,
    propertyId: PROPERTY,
    guestId: GUEST,
    rating: 5,
    comment: 'Excelente',
    createdAt: NOW,
  });
}

describe('user reviews security', () => {
  let app: INestApplication;
  let findByGuestId: jest.Mock;
  let countByGuestId: jest.Mock;

  beforeAll(async () => {
    findByGuestId = jest.fn();
    countByGuestId = jest.fn();
    const repository = { findByGuestId, countByGuestId } as unknown as ReviewRepository;
    const verify = jest.fn(async (token: string) => {
      if (token === 'guest-token') return { sub: GUEST, role: 'GUEST', scopes: [] };
      if (token === 'admin-token') return { sub: ADMIN, role: 'ADMIN', scopes: [] };
      throw new UnauthorizedException('Invalid bearer token');
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [UserReviewsController],
      providers: [
        { provide: ListOwnReviewsUseCase, useValue: new ListOwnReviewsUseCase(repository) },
        { provide: UserJwtVerifier, useValue: { verify } },
        UserAuthGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ClosedValidationPipe());
    app.useGlobalFilters(new ProblemDetailsFilter());
    app.useGlobalInterceptors(new TraceInterceptor());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    findByGuestId.mockReset();
    countByGuestId.mockReset();
    findByGuestId.mockResolvedValue([review()]);
    countByGuestId.mockResolvedValue(1);
  });

  const server = (): Server => app.getHttpServer() as Server;

  it('rejects invalid bearer and a foreign history before querying the database', async () => {
    await request(server()).get(`/internal/v1/reviews/user/${GUEST}`).expect(401);
    await request(server())
      .get(`/internal/v1/reviews/user/${GUEST}`)
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);

    await request(server())
      .get(`/internal/v1/reviews/user/${OTHER}`)
      .set('Authorization', 'Bearer guest-token')
      .expect(403);

    expect(findByGuestId).not.toHaveBeenCalled();
    expect(countByGuestId).not.toHaveBeenCalled();
  });

  it('denies ADMIN new capability over another user history', async () => {
    await request(server())
      .get(`/internal/v1/reviews/user/${OTHER}`)
      .set('Authorization', 'Bearer admin-token')
      .expect(403);

    expect(findByGuestId).not.toHaveBeenCalled();
  });

  it('ignores x-user-id spoofing and uses the validated principal', async () => {
    const response = await request(server())
      .get(`/internal/v1/reviews/user/${GUEST}`)
      .set('Authorization', 'Bearer guest-token')
      .set('x-user-id', OTHER)
      .expect(200);

    expect(findByGuestId).toHaveBeenCalledWith(GUEST, { page: 1, pageSize: 20 });
    expect(JSON.stringify(response.body)).not.toContain(OTHER);
    expect(response.body.items[0]).not.toHaveProperty('guestId');
    expect(response.body.items[0]).not.toHaveProperty('bookingId');
  });

  it('applies authentication precedence over ownership checks', async () => {
    await request(server()).get(`/internal/v1/reviews/user/${OTHER}`).expect(401);
    await request(server())
      .get(`/internal/v1/reviews/user/${OTHER}`)
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
  });
});
