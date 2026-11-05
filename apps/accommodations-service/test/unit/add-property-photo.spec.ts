import { randomUUID } from 'node:crypto';
import { AddPropertyPhotoUseCase } from '../../src/application/photos/add-property-photo.use-case';
import type { NewPhoto, PropertyRepository } from '../../src/application/ports/property.repository';
import type { StoragePort } from '../../src/application/ports/storage.port';
import type { Photo, Property } from '../../src/domain/properties/property.types';
import { location, png } from '../fixtures/accommodations.fixture';

const ownerId = randomUUID();
function property(photos: Photo[] = []): Property {
  const at = new Date('2026-11-04T12:00:00.000Z');
  return {
    id: randomUUID(), ownerId, type: 'HOUSE', name: 'Casa', description: null, location, status: 'DRAFT', version: 1,
    rooms: [{ id: randomUUID(), name: 'A', capacity: 1, basePrice: null }], features: [], photos, createdAt: at, updatedAt: at,
  };
}

describe('ACC-030 add photo compensation', () => {
  it('stores then compensates when metadata persistence fails', async () => {
    const key = 'ab'.repeat(32);
    const stored: string[] = []; const removed: string[] = [];
    const storage: StoragePort = {
      store: (content) => { stored.push(Buffer.from(content).toString('hex')); return Promise.resolve(key); },
      remove: (storageKey) => { removed.push(storageKey); return Promise.resolve(); },
    };
    const repo: PropertyRepository = {
      addPhoto: async (_id, decide) => { await decide(property()); throw new Error('constraint'); },
      create: () => Promise.reject(new Error('unused')), findById: () => Promise.reject(new Error('unused')), replace: () => Promise.reject(new Error('unused')),
    };
    await expect(new AddPropertyPhotoUseCase(repo, storage).execute(randomUUID(), { sub: ownerId, role: 'OWNER' }, png)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(stored).toHaveLength(1);
    expect(removed).toEqual([key]);
  });

  it('does not store when the caller is not the owner', async () => {
    let stored = 0;
    const storage: StoragePort = { store: () => { stored += 1; return Promise.resolve('x'); }, remove: () => Promise.resolve() };
    const repo: PropertyRepository = {
      addPhoto: async (_id, decide): Promise<Photo | null> => { await decide(property()); return null; },
      create: () => Promise.reject(new Error('unused')), findById: () => Promise.reject(new Error('unused')), replace: () => Promise.reject(new Error('unused')),
    };
    await expect(new AddPropertyPhotoUseCase(repo, storage).execute(randomUUID(), { sub: randomUUID(), role: 'OWNER' }, png)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(stored).toBe(0);
  });

  it('persists metadata with the next position when storage succeeds', async () => {
    const created: NewPhoto[] = [];
    const photo: Photo = { id: randomUUID(), storageKey: 'cd'.repeat(32), mediaType: 'image/png', byteSize: png.length, position: 1, createdAt: new Date() };
    const storage: StoragePort = { store: () => Promise.resolve(photo.storageKey), remove: () => Promise.resolve() };
    const repo: PropertyRepository = {
      addPhoto: async (_id, decide) => { created.push(await decide(property([photo]))); return photo; },
      create: () => Promise.reject(new Error('unused')), findById: () => Promise.reject(new Error('unused')), replace: () => Promise.reject(new Error('unused')),
    };
    await expect(new AddPropertyPhotoUseCase(repo, storage).execute(photo.id, { sub: ownerId, role: 'OWNER' }, png)).resolves.toBe(photo);
    expect(created[0]).toMatchObject({ storageKey: photo.storageKey, mediaType: 'image/png', byteSize: png.length, position: 2 });
  });
});
