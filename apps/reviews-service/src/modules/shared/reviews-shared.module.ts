import { Global, Module } from '@nestjs/common';
import { CLOCK_PORT, SystemClock } from '@reviews/application/ports/clock.port';
import {
  ID_GENERATOR_PORT,
  UuidGenerator,
} from '@reviews/application/ports/id-generator.port';
import { SERVICE_TOKEN_PORT } from '@reviews/application/ports/service-token.port';
import { ReviewsLogger } from '@reviews/infrastructure/observability/reviews-logger';
import { ReviewsMetrics } from '@reviews/infrastructure/observability/reviews-metrics';
import { EnvironmentServiceTokenProvider } from '@reviews/infrastructure/security/environment-service-token.provider';
import { ServiceJwtVerifier } from '@reviews/infrastructure/security/service-jwt.verifier';
import { UserJwtVerifier } from '@reviews/infrastructure/security/user-jwt.verifier';
import { ServiceAuthGuard } from '@reviews/interfaces/http/guards/service-auth.guard';
import { UserAuthGuard } from '@reviews/interfaces/http/guards/user-auth.guard';

@Global()
@Module({
  providers: [
    UserJwtVerifier,
    ServiceJwtVerifier,
    UserAuthGuard,
    ServiceAuthGuard,
    ReviewsLogger,
    ReviewsMetrics,
    EnvironmentServiceTokenProvider,
    { provide: SERVICE_TOKEN_PORT, useExisting: EnvironmentServiceTokenProvider },
    { provide: CLOCK_PORT, useClass: SystemClock },
    { provide: ID_GENERATOR_PORT, useClass: UuidGenerator },
  ],
  exports: [
    UserJwtVerifier,
    ServiceJwtVerifier,
    UserAuthGuard,
    ServiceAuthGuard,
    ReviewsLogger,
    ReviewsMetrics,
    EnvironmentServiceTokenProvider,
    SERVICE_TOKEN_PORT,
    CLOCK_PORT,
    ID_GENERATOR_PORT,
  ],
})
export class ReviewsSharedModule {}
