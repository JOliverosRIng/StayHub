import { Module } from '@nestjs/common';

import { LOGIN_USE_CASE } from '@auth/application/ports/auth-use-cases.port';
import { AUTH_CACHE, type AuthCache } from '@auth/application/ports/cache.port';
import { PASSWORD_HASHER, type PasswordHasher } from '@auth/application/ports/password-hasher.port';
import { CREDENTIAL_REPOSITORY, type CredentialRepository } from '@auth/application/ports/repositories.port';
import { SESSION_UNIT_OF_WORK, type SessionUnitOfWork } from '@auth/application/ports/session-unit-of-work.port';
import { USERS_SERVICE, type UsersServicePort } from '@auth/application/ports/users-service.port';
import {
  LOGIN_RATE_LIMITER,
  LoginRateLimiterService,
} from '@auth/application/login/login-rate-limiter';
import { LoginService } from '@auth/application/login/login.use-case';
import {
  ISSUE_SESSION_TOKENS,
  type SessionTokensIssuer,
} from '@auth/application/sessions/issue-session-tokens.service';
import { AUTH_CONFIG, type AuthConfig } from '@auth/infrastructure/config/auth-config';
import { LoginController } from '@auth/interfaces/http/login.controller';
import { CoreModule } from '@auth/modules/core/core.module';
import { CredentialsModule } from '@auth/modules/credentials/credentials.module';
import { ServiceAuthModule } from '@auth/modules/service-auth/service-auth.module';
import { SessionsModule } from '@auth/modules/sessions/sessions.module';
import { TokensModule } from '@auth/modules/tokens/tokens.module';

@Module({
  imports: [CoreModule, CredentialsModule, TokensModule, SessionsModule, ServiceAuthModule],
  controllers: [LoginController],
  providers: [
    {
      provide: LOGIN_RATE_LIMITER,
      useFactory: (cache: AuthCache, config: AuthConfig): LoginRateLimiterService =>
        new LoginRateLimiterService({
          cache,
          identifierSecret: config.loginIdentifierHmacSecret,
        }),
      inject: [AUTH_CACHE, AUTH_CONFIG],
    },
    {
      provide: LOGIN_USE_CASE,
      useFactory: (
        users: UsersServicePort,
        credentials: CredentialRepository,
        hasher: PasswordHasher,
        rateLimiter: LoginRateLimiterService,
        unitOfWork: SessionUnitOfWork,
        issuer: SessionTokensIssuer,
      ): LoginService =>
        new LoginService({ users, credentials, hasher, rateLimiter, unitOfWork, issuer }),
      inject: [
        USERS_SERVICE,
        CREDENTIAL_REPOSITORY,
        PASSWORD_HASHER,
        LOGIN_RATE_LIMITER,
        SESSION_UNIT_OF_WORK,
        ISSUE_SESSION_TOKENS,
      ],
    },
  ],
  exports: [LOGIN_USE_CASE, LOGIN_RATE_LIMITER],
})
export class LoginModule {}
