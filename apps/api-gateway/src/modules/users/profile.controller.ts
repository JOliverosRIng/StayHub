import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  Controller,
  Get,
  Patch,
  PayloadTooLargeException,
  Req,
  UnsupportedMediaTypeException,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { isEmail } from 'class-validator';
import type { Request } from 'express';

import {
  UsersProfileClient,
  type ProfileMultipart,
  type UsersProfile,
} from '@gateway/infrastructure/http/users-profile.client';

import { PHOTO_MAX_BYTES } from './profile-streaming.interceptor';
import { contextOf, userIdOf } from './profile-request';

/**
 * GW-048 — Rutas autenticadas de perfil (RQ-01, FR-011–FR-024).
 *
 * `GET /users/{userId}/profile` y `PATCH /users/{userId}/profile` exigen bearer válido +
 * introspección (guards globales de GW-040/GW-039) y delegan en el cliente Users (GW-046),
 * reenviando SOLO el bearer validado y el `traceId` (GW-017: ninguna cabecera de identidad del
 * cliente). El PATCH valida el DTO cerrado del perfil (nombre 2–100, correo ≤254, teléfono E.164,
 * ≤20 preferencias escalares; `null` elimina opcionales; campo desconocido → 400), acota la foto a
 * 5.000.000 bytes (413) y su tipo a JPEG/PNG (415), y reenvía el multipart a Users. Los estados
 * 200/400/401/403/404/409/413/415/503 se expresan como Problem Details.
 *
 * El ownership (403 por perfil ajeno) lo añade GW-053; hasta entonces no se comprueba aquí (Users
 * lo aplica de todos modos al revalidar el bearer y exigir `sub == userId`).
 */

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const MAX_PREFERENCES = 20;
const MULTER_FILE_LIMIT = PHOTO_MAX_BYTES + 512_000;
const ALLOWED_PROFILE_FIELDS = new Set([
  'expectedVersion',
  'name',
  'email',
  'phone',
  'preferences',
  'photo',
]);

interface MulterFile {
  readonly buffer: Buffer;
  readonly mimetype: string;
  readonly size: number;
}

type MultipartRequest = Request & { file?: MulterFile };

@Controller('users')
export class ProfileController {
  public constructor(private readonly users: UsersProfileClient) {}

  @Get(':userId/profile')
  public getProfile(@Req() request: Request): Promise<UsersProfile> {
    return this.users.getProfile(userIdOf(request), contextOf(request));
  }

  @Patch(':userId/profile')
  @UseInterceptors(
    FileInterceptor('photo', {
      limits: { fileSize: MULTER_FILE_LIMIT },
      fileFilter: photoFilter,
    }),
  )
  public updateProfile(@Req() request: Request): Promise<UsersProfile> {
    const multipartRequest = request as MultipartRequest;
    const fields = multipartRequest.body as Record<string, unknown> | undefined;
    const profile = validateProfilePatch(fields?.['profile']);
    const photo = readPhoto(multipartRequest.file);
    const multipart = buildMultipart(profile, photo);
    return this.users.updateProfile(userIdOf(request), contextOf(request), multipart);
  }
}

function photoFilter(
  _request: Request,
  file: { readonly mimetype: string },
  callback: (error: Error | null, acceptFile: boolean) => void,
): void {
  if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
    callback(null, true);
    return;
  }
  callback(new UnsupportedMediaTypeException({ code: 'UNSUPPORTED_MEDIA_TYPE' }), false);
}

function readPhoto(file: MulterFile | undefined): { bytes: Buffer; mimetype: string } | undefined {
  if (file === undefined) return undefined;
  if (file.size > PHOTO_MAX_BYTES) {
    throw new PayloadTooLargeException({ code: 'PHOTO_TOO_LARGE' });
  }
  return { bytes: file.buffer, mimetype: file.mimetype };
}

function validateProfilePatch(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string') {
    throw invalid('PROFILE_PART_REQUIRED');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw invalid('PROFILE_INVALID_JSON');
  }
  if (!isPlainObject(parsed)) {
    throw invalid('PROFILE_INVALID');
  }
  for (const key of Object.keys(parsed)) {
    if (!ALLOWED_PROFILE_FIELDS.has(key)) {
      throw invalid('UNKNOWN_FIELD');
    }
  }

  const version = parsed['expectedVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw invalid('EXPECTED_VERSION');
  }
  if ('name' in parsed && !isValidName(parsed['name'])) throw invalid('INVALID_NAME');
  if ('email' in parsed && !isValidEmail(parsed['email'])) throw invalid('INVALID_EMAIL');
  if ('phone' in parsed && !isValidPhone(parsed['phone'])) throw invalid('INVALID_PHONE');
  if ('preferences' in parsed && !isValidPreferences(parsed['preferences'])) {
    throw invalid('INVALID_PREFERENCES');
  }
  if ('photo' in parsed && parsed['photo'] !== null) throw invalid('INVALID_PHOTO');

  return parsed;
}

function invalid(code: string): BadRequestException {
  return new BadRequestException({ code });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidName(value: unknown): boolean {
  return typeof value === 'string' && value.length >= 2 && value.length <= 100;
}

function isValidEmail(value: unknown): boolean {
  return typeof value === 'string' && value.length <= 254 && isEmail(value);
}

function isValidPhone(value: unknown): boolean {
  return value === null || (typeof value === 'string' && E164_PATTERN.test(value));
}

function isValidPreferences(value: unknown): boolean {
  if (value === null) return true;
  if (!isPlainObject(value)) return false;
  const entries = Object.values(value);
  if (entries.length > MAX_PREFERENCES) return false;
  return entries.every(
    (entry) => typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean',
  );
}

function buildMultipart(
  profile: Record<string, unknown>,
  photo: { bytes: Buffer; mimetype: string } | undefined,
): ProfileMultipart {
  const boundary = `stayhub${randomUUID().replace(/-/g, '')}`;
  const parts: Buffer[] = [
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="profile"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(profile)}\r\n`,
    ),
  ];
  if (photo !== undefined) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="photo"\r\nContent-Type: ${photo.mimetype}\r\n\r\n`,
      ),
      photo.bytes,
      Buffer.from('\r\n'),
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    body: new Uint8Array(Buffer.concat(parts)),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}
