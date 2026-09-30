import { Module } from '@nestjs/common';

import { USERS_SERVICE } from '@auth/application/ports/users-service.port';
import { UsersLoginIdentityClient } from '@auth/infrastructure/http/users-login-identity.client';
import { UsersRegistrationClient } from '@auth/infrastructure/http/users-registration.client';
import { UsersServiceAdapter } from '@auth/infrastructure/http/users-service.adapter';
import { UsersServiceClient } from '@auth/infrastructure/http/users-service.client';
import { ServiceJwtVerifier } from '@auth/infrastructure/security/service-jwt.verifier';
import { UsersServiceTokenProvider } from '@auth/infrastructure/security/users-service-token.provider';
import { ServiceAuthGuard } from '@auth/interfaces/http/guards/service-auth.guard';
import { CoreModule } from '@auth/modules/core/core.module';

@Module({
  imports: [CoreModule],
  providers: [
    ServiceJwtVerifier,
    UsersServiceTokenProvider,
    UsersServiceClient,
    UsersRegistrationClient,
    UsersLoginIdentityClient,
    UsersServiceAdapter,
    { provide: USERS_SERVICE, useExisting: UsersServiceAdapter },
    ServiceAuthGuard,
  ],
  exports: [
    CoreModule,
    ServiceJwtVerifier,
    UsersServiceTokenProvider,
    UsersServiceClient,
    UsersRegistrationClient,
    UsersLoginIdentityClient,
    USERS_SERVICE,
    ServiceAuthGuard,
  ],
})
export class ServiceAuthModule {}
