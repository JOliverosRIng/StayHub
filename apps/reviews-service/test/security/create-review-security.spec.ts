import { type INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import {
  CreateReviewUseCase,
} from '@reviews/application/create-review/create-review.use-case';
import type { ClockPort } from '@reviews/application/ports/clock.port';
import type { IdGeneratorPort } from '@reviews/application/ports/id-generator.port';
import type { ReviewUnitOfWork } from '@reviews/application/ports/review.unit-of-work';
import type {
  ReviewEligibility,
  StayEligibilityPort,
} from '@reviews/application/ports/stay-eligibility.port';
import { Review } from '@reviews/domain/reviews/review';
import { UserJwtVerifier } from '@reviews/infrastructure/security/user-jwt.verifier';
import { UserAuthGuard } from '@reviews/interfaces/http/guards/user-auth.guard';
import { ProblemDetailsFilter } from '@reviews/interfaces/http/problem.filter';
import { ReviewsController } from '@reviews/interfaces/http/reviews/reviews.controller';
import { TraceInterceptor } from '@reviews/interfaces/http/trace.interceptor';
import { ClosedValidationPipe } from '@reviews/interfaces/http/validation.pipe';

const BOOKING = '00000000-0000-4000-8000-000000000001';
const GUEST = '00000000-0000-4000-8000-000000000002';
const ADMIN = '00000000-0000-4000-8000-000000000003';
const PROPERTY = '00000000-0000-4000-8000-000000000004';
const REVIEW_ID = '00000000-0000-4000-8000-000000000005';
const NOW = new Date('2026-01-01T00:00:00.000Z');

function eligible(): ReviewEligibility {
  return { bookingId: BOOKING, guestId: GUEST, propertyId: PROPERTY, eligible: true };
}

describe('create review security', () => {
  let app: INestApplication;
  let create: jest.Mock;

  beforeAll(async () => {
    const getEligibility = jest.fn().mockResolvedValue(eligible());
    create = jest.fn().mockImplementation(async (review: Review) => review);
    const useCase = new CreateReviewUseCase(
      { getEligibility } as StayEligibilityPort,
      { create } as ReviewUnitOfWork,
      { now: () => NOW } as ClockPort,
      { generate: () => REVIEW_ID } as IdGeneratorPort,
    );

    const verify = jest.fn(async (token: string) => {
      if (token === 'guest-token') return { sub: GUEST, role: 'GUEST', scopes: [] };
      if (token === 'admin-token') return { sub: ADMIN, role: 'ADMIN', scopes: [] };
      throw new UnauthorizedException('Invalid bearer token');
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [ReviewsController],
      providers: [
        { provide: CreateReviewUseCase, useValue: useCase },
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

  const server = (): Server => app.getHttpServer() as Server;

  it('rejects missing or invalid JWT and OWNER or ADMIN principals', async () => {
    await request(server())
      .post('/internal/v1/reviews')
      .send({ bookingId: BOOKING, rating: 5, comment: 'ok' })
      .expect(401);

    await request(server())
      .post('/internal/v1/reviews')
      .set('Authorization', 'Bearer unknown-token')
      .send({ bookingId: BOOKING, rating: 5, comment: 'ok' })
      .expect(401);

    await request(server())
      .post('/internal/v1/reviews')
      .set('Authorization', 'Bearer admin-token')
      .send({ bookingId: BOOKING, rating: 5, comment: 'ok' })
      .expect(403);

    expect(create).not.toHaveBeenCalled();
  });

  it('rejects guestId or propertyId supplied through the body', async () => {
    await request(server())
      .post('/internal/v1/reviews')
      .set('Authorization', 'Bearer guest-token')
      .send({ bookingId: BOOKING, rating: 5, comment: 'ok', guestId: ADMIN })
      .expect(400);

    await request(server())
      .post('/internal/v1/reviews')
      .set('Authorization', 'Bearer guest-token')
      .send({ bookingId: BOOKING, rating: 5, comment: 'ok', propertyId: PROPERTY })
      .expect(400);

    expect(create).not.toHaveBeenCalled();
  });

  it('treats hostile comments as inert text and never echoes identifiers', async () => {
    const hostile = "'; DROP TABLE reviews; -- <script>alert(1)</script>";

    const response = await request(server())
      .post('/internal/v1/reviews')
      .set('Authorization', 'Bearer guest-token')
      .send({ bookingId: BOOKING, rating: 1, comment: hostile })
      .expect(201);

    expect(response.body).toMatchObject({ id: REVIEW_ID, propertyId: PROPERTY, comment: hostile });
    expect(response.body).not.toHaveProperty('guestId');
    expect(response.body).not.toHaveProperty('bookingId');
    expect(create).toHaveBeenCalledTimes(1);
    expect((create.mock.calls[0][0] as Review).toSnapshot()).toMatchObject({
      guestId: GUEST,
      comment: hostile,
    });
  });
});
