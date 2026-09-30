import { Module } from '@nestjs/common';
import { USER_REPOSITORY, type UserRepository } from '@users/application/ports/user.repository';
import { PrismaUserRepository } from '@users/infrastructure/persistence/prisma/user.repository';
import { CreatePendingUser } from '@users/application/registration/create-pending-user.use-case';
import { ActivatePendingUser } from '@users/application/registration/activate-pending-user.use-case';
import { CancelPendingUser } from '@users/application/registration/cancel-pending-user.use-case';
import { RegistrationController } from '@users/interfaces/http/internal/registration.controller';
import { UsersAuthModule } from './users-auth.module';
@Module({ imports: [UsersAuthModule], controllers: [RegistrationController], providers: [
  { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
  { provide: CreatePendingUser, useFactory: (r: UserRepository): CreatePendingUser => new CreatePendingUser(r), inject: [USER_REPOSITORY] },
  { provide: ActivatePendingUser, useFactory: (r: UserRepository): ActivatePendingUser => new ActivatePendingUser(r), inject: [USER_REPOSITORY] },
  { provide: CancelPendingUser, useFactory: (r: UserRepository): CancelPendingUser => new CancelPendingUser(r), inject: [USER_REPOSITORY] },
] })
export class RegistrationStateModule {}
