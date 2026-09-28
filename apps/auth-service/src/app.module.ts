import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';

import {
  CREDENTIAL_REPOSITORY,
  REFRESH_TOKEN_REPOSITORY,
  SESSION_REPOSITORY,
  REGISTRATION_REPOSITORY,
  CLOCK,
  PASSWORD_HASHER,
  TOKEN_SIGNER,
  UUID_GENERATOR,
  type Clock,
  type UuidGenerator,
} from '@auth/application/ports';
import { AuthRedisModule } from '@auth/infrastructure/cache/auth-redis.module';
import { AuthConfigModule } from '@auth/infrastructure/config/config.module';
import { UsersServiceClient } from '@auth/infrastructure/http/users-service.client';
import { AuthLogger } from '@auth/infrastructure/observability/auth-logger';
import { PrismaCredentialRepository } from '@auth/infrastructure/persistence/prisma/credential.repository';
import { PrismaModule } from '@auth/infrastructure/persistence/prisma/prisma.module';
import { PrismaRefreshTokenRepository } from '@auth/infrastructure/persistence/prisma/refresh-token.repository';
import { PrismaRegistrationRepository } from '@auth/infrastructure/persistence/prisma/registration.repository';
import { PrismaSessionRepository } from '@auth/infrastructure/persistence/prisma/session.repository';
import { Argon2PasswordHasher } from '@auth/infrastructure/security/argon2-password-hasher';
import { Rs256TokenService } from '@auth/infrastructure/security/rs256-token.service';
import { ServiceJwtVerifier } from '@auth/infrastructure/security/service-jwt.verifier';
import { UsersServiceTokenProvider } from '@auth/infrastructure/security/users-service-token.provider';
import { ServiceAuthGuard } from '@auth/interfaces/http/guards/service-auth.guard';
import { TraceInterceptor } from '@auth/interfaces/http/trace.interceptor';
import { OpenApiModule } from '@auth/interfaces/openapi/openapi.module';
import { HealthModule } from '@auth/modules/health/health.module';

const systemClock: Clock = { now: () => new Date() };
const uuidGenerator: UuidGenerator = { generate: randomUUID };

@Module({
  imports: [AuthConfigModule, PrismaModule, AuthRedisModule, OpenApiModule, HealthModule],
  providers: [
    AuthLogger,
    { provide: CLOCK, useValue: systemClock },
    { provide: UUID_GENERATOR, useValue: uuidGenerator },
    Argon2PasswordHasher,
    { provide: PASSWORD_HASHER, useExisting: Argon2PasswordHasher },
    Rs256TokenService,
    { provide: TOKEN_SIGNER, useExisting: Rs256TokenService },
    ServiceJwtVerifier,
    UsersServiceTokenProvider,
    ServiceAuthGuard,
    TraceInterceptor,
    UsersServiceClient,
    PrismaCredentialRepository,
    { provide: CREDENTIAL_REPOSITORY, useExisting: PrismaCredentialRepository },
    PrismaRegistrationRepository,
    { provide: REGISTRATION_REPOSITORY, useExisting: PrismaRegistrationRepository },
    PrismaSessionRepository,
    { provide: SESSION_REPOSITORY, useExisting: PrismaSessionRepository },
    PrismaRefreshTokenRepository,
    { provide: REFRESH_TOKEN_REPOSITORY, useExisting: PrismaRefreshTokenRepository },
  ],
})
export class AppModule {}
