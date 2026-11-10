import { type ExecutionContext, type INestApplication } from '@nestjs/common';
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
import { DomainError } from '@reviews/domain/shared/domain-error';
import { UserJwtVerifier } from '@reviews/infrastructure/security/user-jwt.verifier';
import {
  UserAuthGuard,
} from '@reviews/interfaces/http/guards/user-auth.guard';
import { ProblemDetailsFilter } from '@reviews/interfaces/http/problem.filter';
import { ReviewsController } from '@reviews/interfaces/http/reviews/reviews.controller';
import { TraceInterceptor } from '@reviews/interfaces/http/trace.interceptor';
import { ClosedValidationPipe } from '@reviews/interfaces/http/validation.pipe';

const BOOKING = '00000000-0000-4000-8000-000000000001';
const GUEST = '00000000-0000-4000-8000-000000000002';
const PROPERTY = '00000000-0000-4000-8000-000000000003';
const REVIEW_ID = '00000000-0000-4000-8000-000000000004';
const NOW = new Date('2026-01-01T00:00:00.000Z');

interface Principal {
  sub: string;
  role?: string;
  scopes: string[];
}

function eligible(): ReviewEligibility {
  return { bookingId: BOOKING, guestId: GUEST, propertyId: PROPERTY, eligible: true };
}

describe('POST /internal/v1/reviews contract', () => {
  let app: INestApplication;
  let principal: Principal | undefined;
  let getEligibility: jest.Mock;
  let create: jest.Mock;

  beforeAll(async () => {
    getEligibility = jest.fn();
    create = jest.fn();
    const useCase = new CreateReviewUseCase(
      { getEligibility } as StayEligibilityPort,
      { create } as ReviewUnitOfWork,
      { now: () => NOW } as ClockPort,
      { generate: () => REVIEW_ID } as IdGeneratorPort,
    );

    const moduleRef = await Test.createTestingModule({
      controllers: [ReviewsController],
      providers: [
        { provide: CreateReviewUseCase, useValue: useCase },
        { provide: UserJwtVerifier, useValue: { verify: jest.fn() } },
        UserAuthGuard,
      ],
    })
      .overrideGuard(UserAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext): boolean => {
          if (principal) {
            context.switchToHttp().getRequest<{ principal?: Principal }>().principal = principal;
          }
          return true;
        },
      })
      .compile();

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
    principal = { sub: GUEST, role: 'GUEST', scopes: [] };
    getEligibility.mockReset();
    create.mockReset();
    getEligibility.mockResolvedValue(eligible());
    create.mockImplementation(async (review: Review) => review);
  });

  const server = (): Server => app.getHttpServer() as Server;

  it('accepts only bookingId UUID, rating integer 1..5 and trimmed comment 1..2000', async () => {
    const response = await request(server())
      .post('/internal/v1/reviews')
      .send({ bookingId: BOOKING, rating: 5, comment: '  Muy buena  ' })
      .expect(201);

    const body = response.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      ['comment', 'createdAt', 'id', 'propertyId', 'rating'].sort(),
    );
    expect(body).toMatchObject({
      id: REVIEW_ID,
      propertyId: PROPERTY,
      rating: 5,
      comment: 'Muy buena',
      createdAt: NOW.toISOString(),
    });
  });

  it.each([
    ['bookingId no UUID', { bookingId: 'not-a-uuid', rating: 5, comment: 'ok' }],
    ['rating 0', { bookingId: BOOKING, rating: 0, comment: 'ok' }],
    ['rating 6', { bookingId: BOOKING, rating: 6, comment: 'ok' }],
    ['rating string', { bookingId: BOOKING, rating: '5', comment: 'ok' }],
    ['rating decimal', { bookingId: BOOKING, rating: 4.5, comment: 'ok' }],
    ['comentario vacío', { bookingId: BOOKING, rating: 5, comment: '   ' }],
    ['campo desconocido', { bookingId: BOOKING, rating: 5, comment: 'ok', guestId: GUEST }],
    ['propertyId en body', { bookingId: BOOKING, rating: 5, comment: 'ok', propertyId: PROPERTY }],
  ])('rejects invalid payload: %s', async (_name, body) => {
    const response = await request(server())
      .post('/internal/v1/reviews')
      .send(body)
      .expect(400);

    expect(response.body).toMatchObject({ status: 400 });
    expect(Array.isArray(response.body.errors)).toBe(true);
    for (const error of response.body.errors as Array<Record<string, unknown>>) {
      expect(Object.keys(error).sort()).toEqual(['code', 'field']);
    }
    expect(JSON.stringify(response.body.errors)).not.toContain('target');
    expect(JSON.stringify(response.body.errors)).not.toContain('value');
    expect(create).not.toHaveBeenCalled();
  });

  it('maps auth, eligibility, duplicate and dependency outcomes', async () => {
    await request(server())
      .post('/internal/v1/reviews')
      .send({ bookingId: BOOKING, rating: 5, comment: 'ok' })
      .expect(201);

    principal = { sub: GUEST, role: 'ADMIN', scopes: [] };
    await request(server())
      .post('/internal/v1/reviews')
      .send({ bookingId: BOOKING, rating: 5, comment: 'ok' })
      .expect(403);

    principal = { sub: GUEST, role: 'GUEST', scopes: [] };
    getEligibility.mockResolvedValueOnce({ ...eligible(), eligible: false });
    await request(server())
      .post('/internal/v1/reviews')
      .send({ bookingId: BOOKING, rating: 5, comment: 'ok' })
      .expect(404);

    create.mockRejectedValueOnce(new DomainError('REVIEW_ALREADY_EXISTS'));
    await request(server())
      .post('/internal/v1/reviews')
      .send({ bookingId: BOOKING, rating: 5, comment: 'ok' })
      .expect(409);

    getEligibility.mockRejectedValueOnce(new DomainError('DEPENDENCY_UNAVAILABLE'));
    await request(server())
      .post('/internal/v1/reviews')
      .send({ bookingId: BOOKING, rating: 5, comment: 'ok' })
      .expect(503);
  });
});
