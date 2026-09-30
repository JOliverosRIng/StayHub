import { Controller, Get, Patch, Param, Req, Res, StreamableFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { Readable } from 'node:stream';
import type { Profile } from '@users/application/ports/profile.repository';
import { GetOwnProfile } from '@users/application/profiles/get-own-profile.use-case';
import { UpdateOwnProfile } from '@users/application/profiles/update-own-profile.use-case';
import { GetOwnProfilePhoto } from '@users/application/profiles/get-own-profile-photo.use-case';
import { ProfileOwnershipGuard } from '../guards/profile-ownership.guard';
import { ProfileMultipartInterceptor, type ProfileRequest } from './profile-multipart.interceptor';
import { ProfileGetApi, ProfilePatchApi, ProfilePhotoApi } from '../../openapi/profile.openapi';
@Controller('internal/v1/users/:userId/profile') @UseGuards(AuthGuard('jwt'), ProfileOwnershipGuard) @ApiBearerAuth('bearerAuth')
export class ProfileController {
  constructor(private readonly getProfile: GetOwnProfile, private readonly updateProfile: UpdateOwnProfile, private readonly getPhoto: GetOwnProfilePhoto) {}
  @Get() @ProfileGetApi()
  get(@Param('userId') id: string): Promise<Profile> { return this.getProfile.execute(id); }
  @Patch() @UseInterceptors(ProfileMultipartInterceptor) @ProfilePatchApi()
  update(@Param('userId') id: string, @Req() request: ProfileRequest): Promise<Profile> { return this.updateProfile.execute(id, request.profilePatch, request.profilePhoto); }
  @Get('photo') @ProfilePhotoApi()
  async photo(@Param('userId') id: string, @Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    const photo = await this.getPhoto.execute(id);
    response.setHeader('ETag', `"${photo.sha256}"`); response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(Readable.from([Buffer.from(photo.content)]), { type: photo.mediaType, length: photo.byteSize });
  }
}
