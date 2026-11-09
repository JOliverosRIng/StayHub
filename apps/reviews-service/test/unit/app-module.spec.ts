import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { CreateReviewUseCase } from '@reviews/application/create-review/create-review.use-case';
import { PrismaService } from '@reviews/infrastructure/persistence/prisma/prisma.service';
import { ReviewsController } from '@reviews/interfaces/http/reviews/reviews.controller';

describe('AppModule composition', () => {
  beforeAll(() => {
    process.env.REVIEWS_DATABASE_URL = 'postgresql://user:pass@localhost:5432/reviews';
    process.env.REVIEWS_USER_JWT_PUBLIC_KEYS_JSON = '{"dev-key":"pem"}';
    process.env.REVIEWS_USER_JWT_ISSUER = 'stayhub-auth';
    process.env.REVIEWS_USER_JWT_AUDIENCE = 'stayhub-api';
    process.env.REVIEWS_GATEWAY_JWT_PUBLIC_KEYS_JSON = '{"dev-key":"pem"}';
    process.env.REVIEWS_GATEWAY_JWT_ISSUER = 'stayhub-gateway';
    process.env.REVIEWS_GATEWAY_JWT_AUDIENCE = 'stayhub-reviews-service';
    process.env.REVIEWS_GATEWAY_JWT_SCOPE = 'reviews:read';
    process.env.REVIEWS_BOOKINGS_BASE_URL = 'http://bookings-service:3005';
    process.env.REVIEWS_BOOKINGS_SERVICE_TOKEN = 'service-token';
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://otel-collector:4318';
  });

  it('resolves the reviews controller and its use case through DI', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ review: {}, isReady: async () => true })
      .compile();

    expect(moduleRef.get(ReviewsController)).toBeInstanceOf(ReviewsController);
    expect(moduleRef.get(CreateReviewUseCase)).toBeInstanceOf(CreateReviewUseCase);

    await moduleRef.close();
  });
});
