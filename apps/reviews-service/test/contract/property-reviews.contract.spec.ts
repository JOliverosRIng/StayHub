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
const NOW = new Date('2026-01-01T00:00:00.000Z');

function review(id: string): Review {
  return Review.create({
    id,
    bookingId: id,
    propertyId: PROPERTY,
    guestId: GUEST,
    rating: 5,
    comment: 'Excelente',
    createdAt: NOW,
  });
}

describe('GET /internal/v1/properties/{propertyId}/reviews contract', () => {
  let app: INestApplication;
  let findByPropertyId: jest.Mock;
  let countByPropertyId: jest.Mock;

  beforeAll(async () => {
    findByPropertyId = jest.fn();
    countByPropertyId = jest.fn();
    const repository = { findByPropertyId, countByPropertyId } as unknown as ReviewRepository;
    const useCase = new ListPropertyReviewsUseCase(repository);
    const verify = jest.fn(async (token: string) => {
      if (token === 'service-token') return { sub: 'gateway', scopes: ['reviews:read'] };
      throw new UnauthorizedException('Invalid bearer token');
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [PropertyReviewsController],
      providers: [
        { provide: ListPropertyReviewsUseCase, useValue: useCase },
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
    findByPropertyId.mockResolvedValue([
      review('00000000-0000-4000-8000-000000000011'),
      review('00000000-0000-4000-8000-000000000012'),
    ]);
    countByPropertyId.mockResolvedValue(5);
  });

  const server = (): Server => app.getHttpServer() as Server;

  it('returns a closed ReviewPage ordered by the repository contract', async () => {
    const response = await request(server())
      .get(`/internal/v1/properties/${PROPERTY}/reviews`)
      .query({ page: '1', pageSize: '2' })
      .set('Authorization', 'Bearer service-token')
      .expect(200);

    expect(findByPropertyId).toHaveBeenCalledWith(PROPERTY, { page: 1, pageSize: 2 });
    expect(response.body).toMatchObject({ page: 1, pageSize: 2, total: 5, totalPages: 3 });
    expect(response.body.items).toHaveLength(2);
    for (const item of response.body.items as Record<string, unknown>[]) {
      expect(Object.keys(item).sort()).toEqual(['comment', 'createdAt', 'id', 'propertyId', 'rating']);
    }
  });

  it('returns an empty page for a property without reviews', async () => {
    findByPropertyId.mockResolvedValueOnce([]);
    countByPropertyId.mockResolvedValueOnce(0);

    const response = await request(server())
      .get(`/internal/v1/properties/${PROPERTY}/reviews`)
      .set('Authorization', 'Bearer service-token')
      .expect(200);

    expect(response.body).toMatchObject({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
  });

  it.each([
    ['UUID inválido', '/internal/v1/properties/not-a-uuid/reviews', {}],
    ['page 0', `/internal/v1/properties/${PROPERTY}/reviews`, { page: '0' }],
    ['page decimal', `/internal/v1/properties/${PROPERTY}/reviews`, { page: '1.5' }],
    ['pageSize 101', `/internal/v1/properties/${PROPERTY}/reviews`, { pageSize: '101' }],
    ['pageSize texto', `/internal/v1/properties/${PROPERTY}/reviews`, { pageSize: 'x' }],
  ])('rejects invalid input: %s', async (_name, path, query) => {
    await request(server())
      .get(path)
      .query(query)
      .set('Authorization', 'Bearer service-token')
      .expect(400);
  });

  it('requires a valid service token', async () => {
    await request(server())
      .get(`/internal/v1/properties/${PROPERTY}/reviews`)
      .expect(401);

    await request(server())
      .get(`/internal/v1/properties/${PROPERTY}/reviews`)
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
  });
});
