import { Module } from '@nestjs/common';
import { PROFILE_REPOSITORY, type ProfileRepository } from '@users/application/ports/profile.repository';
import { PrismaProfileRepository } from '@users/infrastructure/persistence/prisma/profile.repository';
import { GetOwnProfile } from '@users/application/profiles/get-own-profile.use-case';
import { UpdateOwnProfile } from '@users/application/profiles/update-own-profile.use-case';
import { GetOwnProfilePhoto } from '@users/application/profiles/get-own-profile-photo.use-case';
import { ProfileController } from '@users/interfaces/http/profiles/profile.controller';
import { ProfileOwnershipGuard } from '@users/interfaces/http/guards/profile-ownership.guard';
import { UsersAuthModule } from './users-auth.module';
@Module({ imports: [UsersAuthModule], controllers: [ProfileController], providers: [
  ProfileOwnershipGuard,
  { provide: PROFILE_REPOSITORY, useClass: PrismaProfileRepository },
  { provide: GetOwnProfile, useFactory: (r: ProfileRepository): GetOwnProfile => new GetOwnProfile(r), inject: [PROFILE_REPOSITORY] },
  { provide: UpdateOwnProfile, useFactory: (r: ProfileRepository): UpdateOwnProfile => new UpdateOwnProfile(r), inject: [PROFILE_REPOSITORY] },
  { provide: GetOwnProfilePhoto, useFactory: (r: ProfileRepository): GetOwnProfilePhoto => new GetOwnProfilePhoto(r), inject: [PROFILE_REPOSITORY] },
] })
export class ProfilesModule {}
