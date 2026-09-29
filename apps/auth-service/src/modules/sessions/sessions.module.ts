import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import {
  ROTATE_REFRESH_TOKEN_USE_CASE,
  VALIDATE_SESSION_USE_CASE,
} from '@auth/application/ports/auth-use-cases.port';
import { AUTH_CACHE, type AuthCache } from '@auth/application/ports/cache.port';
import { CLOCK, type Clock } from '@auth/application/ports/clock.port';
import {
  REFRESH_TOKEN_CODEC,
  type RefreshTokenCodec,
} from '@auth/application/ports/refresh-token-codec.port';
import {
  REFRESH_TOKEN_REPOSITORY,
  SESSION_REPOSITORY,
  type RefreshTokenRepository,
  type SessionRepository,
} from '@auth/application/ports/repositories.port';
import {
  SESSION_UNIT_OF_WORK,
  type SessionUnitOfWork,
} from '@auth/application/ports/session-unit-of-work.port';
import {
  ISSUE_SESSION_TOKENS,
  type SessionTokensIssuer,
} from '@auth/application/sessions/issue-session-tokens.service';
import { RotateRefreshTokenService } from '@auth/application/sessions/rotate-refresh-token.use-case';
import { ValidateSessionService } from '@auth/application/sessions/validate-session.use-case';
import { PrismaModule } from '@auth/infrastructure/persistence/prisma/prisma.module';
import { PrismaRefreshTokenRepository } from '@auth/infrastructure/persistence/prisma/refresh-token.repository';
import { PrismaSessionRepository } from '@auth/infrastructure/persistence/prisma/session.repository';
import { PrismaSessionUnitOfWork } from '@auth/infrastructure/persistence/prisma/session-unit-of-work';
import { AccessTokenStrategy } from '@auth/interfaces/http/auth/jwt.strategy';
import { AccessTokenGuard } from '@auth/interfaces/http/guards/access-token.guard';
import { RolesGuard } from '@auth/interfaces/http/guards/roles.guard';
import { SessionsController } from '@auth/interfaces/http/sessions.controller';
import { CoreModule } from '@auth/modules/core/core.module';
import { ServiceAuthModule } from '@auth/modules/service-auth/service-auth.module';
import { TokensModule } from '@auth/modules/tokens/tokens.module';

@Module({
  imports: [CoreModule, PrismaModule, TokensModule, ServiceAuthModule, PassportModule],
  controllers: [SessionsController],
  providers: [
    PrismaSessionRepository,
    { provide: SESSION_REPOSITORY, useExisting: PrismaSessionRepository },
    PrismaRefreshTokenRepository,
    { provide: REFRESH_TOKEN_REPOSITORY, useExisting: PrismaRefreshTokenRepository },
    PrismaSessionUnitOfWork,
    { provide: SESSION_UNIT_OF_WORK, useExisting: PrismaSessionUnitOfWork },
    {
      provide: ROTATE_REFRESH_TOKEN_USE_CASE,
      useFactory: (
        refreshTokens: RefreshTokenRepository,
        unitOfWork: SessionUnitOfWork,
        codec: RefreshTokenCodec,
        issuer: SessionTokensIssuer,
        clock: Clock,
        cache: AuthCache,
      ): RotateRefreshTokenService =>
        new RotateRefreshTokenService({
          refreshTokens,
          unitOfWork,
          codec,
          issuer,
          clock,
          cache,
        }),
      inject: [
        REFRESH_TOKEN_REPOSITORY,
        SESSION_UNIT_OF_WORK,
        REFRESH_TOKEN_CODEC,
        ISSUE_SESSION_TOKENS,
        CLOCK,
        AUTH_CACHE,
      ],
    },
    {
      provide: VALIDATE_SESSION_USE_CASE,
      useFactory: (
        sessions: SessionRepository,
        cache: AuthCache,
        clock: Clock,
      ): ValidateSessionService => new ValidateSessionService({ sessions, cache, clock }),
      inject: [SESSION_REPOSITORY, AUTH_CACHE, CLOCK],
    },
    AccessTokenStrategy,
    AccessTokenGuard,
    RolesGuard,
  ],
  exports: [
    SESSION_REPOSITORY,
    REFRESH_TOKEN_REPOSITORY,
    SESSION_UNIT_OF_WORK,
    ROTATE_REFRESH_TOKEN_USE_CASE,
    VALIDATE_SESSION_USE_CASE,
    AccessTokenStrategy,
    AccessTokenGuard,
    RolesGuard,
  ],
})
export class SessionsModule {}
