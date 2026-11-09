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
const PROPERTY = '00000000-0000-4000-8000-000000000003';
const NOW = new Date('2026-01-01T00:00:00.000Z');

function review(id: string, guestId = GUEST): Review {
  return Review.create({
    id,
    bookingId: id,
    propertyId: PROPERTY,
    guestId,
    rating: 5,
    comment: 'Excelente',
    createdAt: NOW,
  });
}

describe('GET /internal/v1/reviews/user/{userId} contract', () => {
  let app: INestApplication;
  let findByGuestId: jest.Mock;
  let countByGuestId: jest.Mock;

  beforeAll(async () => {
    findByGuestId = jest.fn();
    countByGuestId = jest.fn();
    const repository = { findByGuestId, countByGuestId } as unknown as ReviewRepository;
    const verify = jest.fn(async (token: string) => {
      if (token === 'guest-token') return { sub: GUEST, role: 'GUEST', scopes: [] };
      if (token === 'other-token') return { sub: OTHER, role: 'GUEST', scopes: [] };
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
    findByGuestId.mockResolvedValue([
      review('00000000-0000-4000-8000-000000000011'),
      review('00000000-0000-4000-8000-000000000012'),
    ]);
    countByGuestId.mockResolvedValue(3);
  });

  const server = (): Server => app.getHttpServer() as Server;

  it('returns the authenticated user own ReviewPage', async () => {
    const response = await request(server())
      .get(`/internal/v1/reviews/user/${GUEST}`)
      .query({ page: '1', pageSize: '2' })
      .set('Authorization', 'Bearer guest-token')
      .expect(200);

    expect(findByGuestId).toHaveBeenCalledWith(GUEST, { page: 1, pageSize: 2 });
    expect(response.body).toMatchObject({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
    expect(response.body.items).toHaveLength(2);
    for (const item of response.body.items as Record<string, unknown>[]) {
      expect(Object.keys(item).sort()).toEqual(['comment', 'createdAt', 'id', 'propertyId', 'rating']);
    }
  });

  it('rejects another user history without revealing its existence', async () => {
    await request(server())
      .get(`/internal/v1/reviews/user/${OTHER}`)
      .set('Authorization', 'Bearer guest-token')
      .expect(403);

    expect(findByGuestId).not.toHaveBeenCalled();
    expect(countByGuestId).not.toHaveBeenCalled();
  });

  it.each([
    ['UUID inválido', '/internal/v1/reviews/user/not-a-uuid', {}],
    ['page 0', `/internal/v1/reviews/user/${GUEST}`, { page: '0' }],
    ['pageSize 101', `/internal/v1/reviews/user/${GUEST}`, { pageSize: '101' }],
  ])('rejects invalid input: %s', async (_name, path, query) => {
    await request(server())
      .get(path)
      .query(query)
      .set('Authorization', 'Bearer guest-token')
      .expect(400);
  });

  it('requires a valid user bearer', async () => {
    await request(server()).get(`/internal/v1/reviews/user/${GUEST}`).expect(401);
    await request(server())
      .get(`/internal/v1/reviews/user/${GUEST}`)
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
  });
});
