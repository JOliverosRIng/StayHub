import {
  Controller,
  Get,
  PayloadTooLargeException,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { UsersProfileClient } from '@gateway/infrastructure/http/users-profile.client';
import { ProfilePhotoApiDocs } from '@gateway/interfaces/openapi/profile.openapi';

import { ProfileOwnershipGuard } from './profile-ownership.guard';
import { PHOTO_MAX_BYTES, ProfileStreamingInterceptor } from './profile-streaming.interceptor';
import { contextOf, userIdOf } from './profile-request';

/**
 * GW-048 — Ruta autenticada `GET /api/v1/users/{userId}/profile/photo` (RQ-01, FR-011–FR-019).
 *
 * Exige bearer válido + introspección (guards globales de GW-040/GW-039). Descarga la foto desde
 * Users con el cliente de GW-046, reenviando solo el bearer validado y el `traceId`, y usa el
 * interceptor de streaming de GW-047 con el límite de 5.000.000 bytes. No filtra datos sensibles.
 *
 * El ownership (403 por foto ajena, incluido ADMIN, antes de contactar a Users) lo aplica el
 * {@link ProfileOwnershipGuard} de GW-053, activo sobre este controlador.
 */
@Controller('users')
@UseGuards(ProfileOwnershipGuard)
export class ProfilePhotoController {
  public constructor(private readonly users: UsersProfileClient) {}

  @Get(':userId/profile/photo')
  @UseInterceptors(ProfileStreamingInterceptor)
  @ProfilePhotoApiDocs()
  public async getPhoto(@Req() request: Request, @Res() response: Response): Promise<void> {
    const photo = await this.users.getProfilePhoto(userIdOf(request), contextOf(request));
    if (photo.bytes.length > PHOTO_MAX_BYTES) {
      throw new PayloadTooLargeException({ code: 'PHOTO_TOO_LARGE' });
    }
    response.setHeader('content-type', photo.contentType);
    response.end(Buffer.from(photo.bytes));
  }
}
