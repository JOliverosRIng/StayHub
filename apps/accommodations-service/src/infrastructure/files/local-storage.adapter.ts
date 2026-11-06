import { randomBytes } from 'node:crypto';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { StoragePort } from '@accommodations/application/ports/storage.port';
import { AccommodationsLogger } from '@accommodations/infrastructure/logging/accommodations-logger';

const KEY = /^[0-9a-f]{64}$/;

/** Writes under an absolute root using a temp file + rename; refuses path-like keys. */
export class LocalStorageAdapter implements StoragePort {
  constructor(private readonly root: string, private readonly logger = new AccommodationsLogger()) {}

  async store(content: Uint8Array): Promise<string> {
    const key = randomBytes(32).toString('hex');
    const dest = join(this.root, key);
    const temp = join(this.root, `.${key}.tmp`);
    try {
      await mkdir(this.root, { recursive: true });
      await writeFile(temp, content, { flag: 'wx' });
      await rename(temp, dest);
      return key;
    } catch (error) {
      await unlink(temp).catch(() => undefined);
      this.logger.dependencyFailure('photo.store', 'UNAVAILABLE');
      throw error;
    }
  }

  async remove(storageKey: string): Promise<void> {
    if (!KEY.test(storageKey)) return;
    try {
      await unlink(join(this.root, storageKey));
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') return;
      this.logger.dependencyFailure('photo.compensate', 'UNAVAILABLE');
      throw error;
    }
  }
}
