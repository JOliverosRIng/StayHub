import { DomainError, invalid } from '../shared/domain-error';
import type { PhotoMediaType } from '../properties/property.types';

export const MAX_PHOTO_BYTES = 5_000_000;
export const MAX_PHOTOS_PER_PROPERTY = 10;

const startsWith = (content: Uint8Array, signature: readonly number[], offset = 0): boolean =>
  content.length >= offset + signature.length && signature.every((byte, i) => content[offset + i] === byte);

/** Detects the media type from magic bytes only; the client-declared type is never trusted. */
export function detectMediaType(content: Uint8Array): PhotoMediaType | null {
  if (startsWith(content, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(content, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(content, [0x52, 0x49, 0x46, 0x46]) && startsWith(content, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  return null;
}

export function inspectPhoto(content: Uint8Array): { mediaType: PhotoMediaType; byteSize: number } {
  if (content.length === 0) return invalid('file');
  if (content.length > MAX_PHOTO_BYTES) throw new DomainError('PHOTO_TOO_LARGE');
  const mediaType = detectMediaType(content);
  if (!mediaType) throw new DomainError('PHOTO_MEDIA_TYPE');
  return { mediaType, byteSize: content.length };
}

export function assertPhotoCapacity(currentCount: number): void {
  if (currentCount >= MAX_PHOTOS_PER_PROPERTY) throw new DomainError('PHOTO_LIMIT_REACHED');
}

export function nextPhotoPosition(photos: readonly { position: number }[]): number {
  return photos.reduce((max, photo) => Math.max(max, photo.position + 1), 0);
}
