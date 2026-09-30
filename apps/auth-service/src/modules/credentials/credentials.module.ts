import { Module } from '@nestjs/common';

import { PASSWORD_HASHER } from '@auth/application/ports/password-hasher.port';
import { CREDENTIAL_REPOSITORY } from '@auth/application/ports/repositories.port';
import { PrismaCredentialRepository } from '@auth/infrastructure/persistence/prisma/credential.repository';
import { PrismaModule } from '@auth/infrastructure/persistence/prisma/prisma.module';
import { Argon2PasswordHasher } from '@auth/infrastructure/security/argon2-password-hasher';
import { CoreModule } from '@auth/modules/core/core.module';

@Module({
  imports: [CoreModule, PrismaModule],
  providers: [
    Argon2PasswordHasher,
    { provide: PASSWORD_HASHER, useExisting: Argon2PasswordHasher },
    PrismaCredentialRepository,
    { provide: CREDENTIAL_REPOSITORY, useExisting: PrismaCredentialRepository },
  ],
  exports: [PASSWORD_HASHER, CREDENTIAL_REPOSITORY],
})
export class CredentialsModule {}
