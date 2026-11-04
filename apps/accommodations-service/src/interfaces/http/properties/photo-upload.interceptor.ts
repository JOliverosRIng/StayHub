import { HttpException, Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Observable } from 'rxjs';
import { MAX_PHOTO_BYTES } from '@accommodations/domain/photos/photo.policy';
import { DomainError, invalid } from '@accommodations/domain/shared/domain-error';

const Upload = FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } });

@Injectable()
export class PhotoUploadInterceptor extends Upload implements NestInterceptor {
  override async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    try {
      return await super.intercept(context, next);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 413) throw new DomainError('PHOTO_TOO_LARGE');
      if ((error as { code?: unknown }).code === 'LIMIT_FILE_SIZE') throw new DomainError('PHOTO_TOO_LARGE');
      if (error instanceof HttpException && error.getStatus() === 400) return invalid('file');
      if (typeof (error as { code?: unknown }).code === 'string' && String((error as { code: string }).code).startsWith('LIMIT_')) return invalid('file');
      throw error;
    }
  }
}
