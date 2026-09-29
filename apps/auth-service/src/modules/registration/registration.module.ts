import { Module } from '@nestjs/common';

import {
  REGISTER_ACCOUNT_USE_CASE,
  type RegisterAccountUseCase,
} from '@auth/application/ports/auth-use-cases.port';
import { CLOCK, type Clock } from '@auth/application/ports/clock.port';
import { PASSWORD_HASHER, type PasswordHasher } from '@auth/application/ports/password-hasher.port';
import { UUID_GENERATOR, type UuidGenerator } from '@auth/application/ports/random.port';
import {
  REGISTRATION_LEASE_SECONDS,
  REGISTRATION_WORK,
  type RegistrationWorkPort,
} from '@auth/application/ports/registration-work.port';
import { REGISTRATION_REPOSITORY } from '@auth/application/ports/repositories.port';
import { AdvanceRegistrationService } from '@auth/application/registration/advance-registration.service';
import {
  RECONCILE_REGISTRATIONS,
  ReconcileRegistrationsUseCase,
} from '@auth/application/registration/reconcile-registrations.use-case';
import { RegisterAccountService } from '@auth/application/registration/register-account.use-case';
import { RegistrationPolicy } from '@auth/domain/registrations/registration-policy';
import { AUTH_CONFIG, type AuthConfig } from '@auth/infrastructure/config/auth-config';
import { UsersRegistrationClient } from '@auth/infrastructure/http/users-registration.client';
import { PrismaModule } from '@auth/infrastructure/persistence/prisma/prisma.module';
import {
  PrismaRegistrationRepository,
  PrismaRegistrationWork,
} from '@auth/infrastructure/persistence/prisma/registration.repository';
import { RegistrationController } from '@auth/interfaces/http/registration.controller';
import { CredentialsModule } from '@auth/modules/credentials/credentials.module';
import { CoreModule } from '@auth/modules/core/core.module';
import { ServiceAuthModule } from '@auth/modules/service-auth/service-auth.module';
import { RegistrationReconcilerService } from './registration-reconciler.service';

@Module({
  imports: [CoreModule, PrismaModule, ServiceAuthModule, CredentialsModule],
  controllers: [RegistrationController],
  providers: [
    PrismaRegistrationRepository,
    { provide: REGISTRATION_REPOSITORY, useExisting: PrismaRegistrationRepository },
    PrismaRegistrationWork,
    { provide: REGISTRATION_WORK, useExisting: PrismaRegistrationWork },
    {
      provide: AdvanceRegistrationService,
      useFactory: (
        work: RegistrationWorkPort,
        users: UsersRegistrationClient,
        hasher: PasswordHasher,
        clock: Clock,
      ): AdvanceRegistrationService => new AdvanceRegistrationService(work, users, hasher, clock),
      inject: [REGISTRATION_WORK, UsersRegistrationClient, PASSWORD_HASHER, CLOCK],
    },
    {
      provide: REGISTER_ACCOUNT_USE_CASE,
      useFactory: (
        work: RegistrationWorkPort,
        users: UsersRegistrationClient,
        advance: AdvanceRegistrationService,
        clock: Clock,
        uuids: UuidGenerator,
        config: AuthConfig,
      ): RegisterAccountUseCase =>
        new RegisterAccountService({
          work,
          users,
          policy: new RegistrationPolicy(config.registrationFingerprintSecret),
          advance,
          clock,
          uuids,
          settings: {
            ttlSeconds: config.reconciler.ttlSeconds,
            leaseSeconds: REGISTRATION_LEASE_SECONDS,
          },
        }),
      inject: [
        REGISTRATION_WORK,
        UsersRegistrationClient,
        AdvanceRegistrationService,
        CLOCK,
        UUID_GENERATOR,
        AUTH_CONFIG,
      ],
    },
    {
      provide: RECONCILE_REGISTRATIONS,
      useFactory: (
        work: RegistrationWorkPort,
        users: UsersRegistrationClient,
        advance: AdvanceRegistrationService,
        clock: Clock,
        uuids: UuidGenerator,
        config: AuthConfig,
      ): ReconcileRegistrationsUseCase =>
        new ReconcileRegistrationsUseCase(work, advance, users, clock, uuids, {
          batchSize: config.reconciler.batchSize,
          maxAttempts: config.reconciler.maxAttempts,
          intervalSeconds: config.reconciler.intervalSeconds,
          leaseSeconds: REGISTRATION_LEASE_SECONDS,
        }),
      inject: [
        REGISTRATION_WORK,
        UsersRegistrationClient,
        AdvanceRegistrationService,
        CLOCK,
        UUID_GENERATOR,
        AUTH_CONFIG,
      ],
    },
    RegistrationReconcilerService,
  ],
  exports: [REGISTER_ACCOUNT_USE_CASE, RECONCILE_REGISTRATIONS],
})
export class RegistrationModule {}
