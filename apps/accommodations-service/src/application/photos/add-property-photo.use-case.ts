import { randomUUID } from 'node:crypto';
import type { PropertyRepository } from '../ports/property.repository';
import type { StoragePort } from '../ports/storage.port';
import { assertPhotoCapacity, inspectPhoto, nextPhotoPosition } from '@accommodations/domain/photos/photo.policy';
import type { Photo, Principal } from '@accommodations/domain/properties/property.types';
import { isOwner } from '@accommodations/domain/properties/visibility.policy';
import { DomainError } from '@accommodations/domain/shared/domain-error';

export class AddPropertyPhotoUseCase {
  constructor(private readonly properties: PropertyRepository, private readonly storage: StoragePort) {}

  async execute(id: string, principal: Principal, content: Uint8Array): Promise<Photo> {
    const inspected = inspectPhoto(content);
    let stored: string | undefined;
    try {
      const photo = await this.properties.addPhoto(id, async (current) => {
        if (!isOwner(current, principal)) throw new DomainError('NOT_FOUND');
        assertPhotoCapacity(current.photos.length);
        stored = await this.storage.store(content);
        return { id: randomUUID(), storageKey: stored, mediaType: inspected.mediaType, byteSize: inspected.byteSize, position: nextPhotoPosition(current.photos) };
      });
      if (!photo) throw new DomainError('NOT_FOUND');
      return photo;
    } catch (error) {
      if (stored) {
        try { await this.storage.remove(stored); } catch { /* adapter records compensate failure */ }
      }
      if (error instanceof DomainError) throw error;
      throw new DomainError('UNAVAILABLE');
    }
  }
}
