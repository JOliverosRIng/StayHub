import { createHash } from 'node:crypto';
import type { Photo } from '@users/application/ports/profile.repository';
import { inspectPhoto } from '@users/domain/photos/photo.policy';
export function preparePhoto(content: Uint8Array, declaredType: string): Photo {
  return { content, mediaType: inspectPhoto(content, declaredType), byteSize: content.length, sha256: createHash('sha256').update(content).digest('hex') };
}
