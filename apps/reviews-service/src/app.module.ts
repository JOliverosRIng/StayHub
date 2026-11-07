import { Module } from '@nestjs/common';
import { CLOCK_PORT, SystemClock } from '@reviews/application/ports/clock.port';
import { ID_GENERATOR_PORT, UuidGenerator } from '@reviews/application/ports/id-generator.port';
import { SERVICE_TOKEN_PORT } from '@reviews/application/ports/service-token.port';
import { ReviewsConfigModule } from '@reviews/infrastructure/config/config.module';
import { ReviewsLogger } from '@reviews/infrastructure/observability/reviews-logger';
import { ReviewsMetrics } from '@reviews/infrastructure/observability/reviews-metrics';
import { PrismaModule } from '@reviews/infrastructure/persistence/prisma/prisma.module';
import { EnvironmentServiceTokenProvider } from '@reviews/infrastructure/security/environment-service-token.provider';
import { ServiceJwtVerifier } from '@reviews/infrastructure/security/service-jwt.verifier';
import { UserJwtVerifier } from '@reviews/infrastructure/security/user-jwt.verifier';
import { ServiceAuthGuard } from '@reviews/interfaces/http/guards/service-auth.guard';
import { UserAuthGuard } from '@reviews/interfaces/http/guards/user-auth.guard';
import { HealthModule } from '@reviews/modules/health/health.module';

@Module({
  imports: [ReviewsConfigModule, PrismaModule, HealthModule],
  providers: [
    UserJwtVerifier, ServiceJwtVerifier, UserAuthGuard, ServiceAuthGuard, ReviewsLogger, ReviewsMetrics,
    EnvironmentServiceTokenProvider,
    { provide: SERVICE_TOKEN_PORT, useExisting: EnvironmentServiceTokenProvider },
    { provide: CLOCK_PORT, useClass: SystemClock },
    { provide: ID_GENERATOR_PORT, useClass: UuidGenerator },
  ],
})
export class AppModule {}
