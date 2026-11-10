import { type INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { ListPropertyReviewsUseCase } from '@reviews/application/list-property-reviews/list-property-reviews.use-case';
import type { ReviewRepository } from '@reviews/application/ports/review.repository';
import { Review } from '@reviews/domain/reviews/review';
import { ServiceJwtVerifier } from '@reviews/infrastructure/security/service-jwt.verifier';
import { ServiceAuthGuard } from '@reviews/interfaces/http/guards/service-auth.guard';
import { ProblemDetailsFilter } from '@reviews/interfaces/http/problem.filter';
import { PropertyReviewsController } from '@reviews/interfaces/http/reviews/property-reviews.controller';
import { TraceInterceptor } from '@reviews/interfaces/http/trace.interceptor';
import { ClosedValidationPipe } from '@reviews/interfaces/http/validation.pipe';

const PROPERTY = '00000000-0000-4000-8000-000000000001';
const GUEST = '00000000-0000-4000-8000-000000000002';
const BOOKING = '00000000-0000-4000-8000-000000000003';
const REVIEW_ID = '00000000-0000-4000-8000-000000000004';
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

describe('property reviews security', () => {
  let app: INestApplication;
  let findByPropertyId: jest.Mock;
  let countByPropertyId: jest.Mock;

  beforeAll(async () => {
    findByPropertyId = jest.fn();
    countByPropertyId = jest.fn();
    const repository = { findByPropertyId, countByPropertyId } as unknown as ReviewRepository;
    const verify = jest.fn(async (token: string) => {
      if (token === 'gateway-token') return { sub: 'gateway', scopes: ['reviews:read'] };
      throw new UnauthorizedException('Invalid bearer token');
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [PropertyReviewsController],
      providers: [
        { provide: ListPropertyReviewsUseCase, useValue: new ListPropertyReviewsUseCase(repository) },
        { provide: ServiceJwtVerifier, useValue: { verify } },
        ServiceAuthGuard,
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
    findByPropertyId.mockReset();
    countByPropertyId.mockReset();
    findByPropertyId.mockResolvedValue([review()]);
    countByPropertyId.mockResolvedValue(1);
  });

  const server = (): Server => app.getHttpServer() as Server;

  it('rejects missing, invalid, wrong-issuer/audience/scope tokens before querying', async () => {
    await request(server()).get(`/internal/v1/properties/${PROPERTY}/reviews`).expect(401);
    await request(server())
      .get(`/internal/v1/properties/${PROPERTY}/reviews`)
      .set('Authorization', 'Bearer wrong-scope')
      .expect(401);

    expect(findByPropertyId).not.toHaveBeenCalled();
    expect(countByPropertyId).not.toHaveBeenCalled();
  });

  it('rejects a malicious property id before touching the repository', async () => {
    await request(server())
      .get('/internal/v1/properties/..%2F..%2Fusers/reviews')
      .set('Authorization', 'Bearer gateway-token')
      .expect(400);

    expect(findByPropertyId).not.toHaveBeenCalled();
  });

  it('never exposes guestId or bookingId in public responses', async () => {
    const response = await request(server())
      .get(`/internal/v1/properties/${PROPERTY}/reviews`)
      .set('Authorization', 'Bearer gateway-token')
      .expect(200);

    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(GUEST);
    expect(serialized).not.toContain(BOOKING);
    expect(response.body.items[0]).not.toHaveProperty('guestId');
    expect(response.body.items[0]).not.toHaveProperty('bookingId');
  });
});
