import { invalid } from '@accommodations/domain/shared/domain-error';

/** Reads the single multipart `file` part; missing or empty files are VALIDATION_ERROR on file. */
export function parsePhotoFile(file: { buffer?: Uint8Array } | undefined): Uint8Array {
  if (!file?.buffer) return invalid('file');
  return file.buffer;
}
