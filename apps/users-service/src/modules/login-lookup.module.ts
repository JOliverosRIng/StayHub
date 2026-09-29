import { Module } from '@nestjs/common';
import { LOGIN_IDENTITY_REPOSITORY, type LoginIdentityRepository } from '@users/application/ports/user.repository';
import { PrismaLoginIdentityRepository } from '@users/infrastructure/persistence/prisma/login-identity.repository';
import { ResolveLoginIdentity } from '@users/application/login/resolve-login-identity.use-case';
import { LoginIdentityController } from '@users/interfaces/http/internal/login-identity.controller';
import { UsersAuthModule } from './users-auth.module';
@Module({ imports: [UsersAuthModule], controllers: [LoginIdentityController], providers: [
  { provide: LOGIN_IDENTITY_REPOSITORY, useClass: PrismaLoginIdentityRepository },
  { provide: ResolveLoginIdentity, useFactory: (r: LoginIdentityRepository): ResolveLoginIdentity => new ResolveLoginIdentity(r), inject: [LOGIN_IDENTITY_REPOSITORY] },
] })
export class LoginLookupModule {}
