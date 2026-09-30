import { Injectable, UnsupportedMediaTypeException, type NestInterceptor, type ExecutionContext, type CallHandler } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { invalid } from '@users/domain/shared/domain-error';
import { preparePhoto } from '@users/infrastructure/files/profile-photo.service';
import type { ProfilePatch, Photo } from '@users/application/ports/profile.repository';
import { UpdateProfileDto } from './update-profile.dto';
export interface ProfileRequest extends Request { profilePatch?: ProfilePatch; profilePhoto?: Photo }
const Upload = FileFieldsInterceptor([{ name: 'photo', maxCount: 1 }, { name: 'profile', maxCount: 1 }], { limits: { fileSize: 5_000_001, files: 2, fields: 1, fieldSize: 100_000, parts: 3 } });
@Injectable()
export class ProfileMultipartInterceptor extends Upload implements NestInterceptor {
  override async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<ProfileRequest>();
    if (!req.is('multipart/form-data')) throw new UnsupportedMediaTypeException();
    return super.intercept(context, { handle: (): Observable<unknown> => {
      const body: unknown = req.body;
      if (!body || typeof body !== 'object' || Object.keys(body).some((k) => k !== 'profile')) invalid('profile');
      const fields = body as Record<string, unknown>;
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const jsonFile = files?.profile?.[0];
      if (jsonFile && (fields.profile !== undefined || jsonFile.mimetype !== 'application/json' || jsonFile.size > 100_000)) invalid('profile');
      const raw = jsonFile ? jsonFile.buffer.toString('utf8') : fields.profile;
      if (typeof raw !== 'string') invalid('profile');
      let parsed: unknown; try { parsed = JSON.parse(raw); } catch { invalid('profile'); }
      const file = files?.photo?.[0];
      req.profilePatch = UpdateProfileDto.parse(parsed, file !== undefined);
      if (file) req.profilePhoto = preparePhoto(file.buffer, file.mimetype);
      return next.handle();
    } });
  }
}
