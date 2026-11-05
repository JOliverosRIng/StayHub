import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Harness } from '../integration/postgres.setup';
import { png } from './accommodations.fixture';

/** Inserts a PNG into the local storage root and Photo metadata without going through POST /photos (ACC-026). */
export async function insertTestPhoto(h: Harness, propertyId: string, position = 0): Promise<void> {
  const storageKey = randomUUID().replace(/-/g, '');
  await mkdir(h.config.photoStorageRoot, { recursive: true });
  await writeFile(join(h.config.photoStorageRoot, storageKey), png);
  await h.db.photo.create({ data: { id: randomUUID(), propertyId, storageKey, mediaType: 'image/png', byteSize: png.length, position } });
}
