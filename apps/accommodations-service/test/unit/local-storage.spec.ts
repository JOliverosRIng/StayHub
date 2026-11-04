import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStorageAdapter } from '../../src/infrastructure/files/local-storage.adapter';
import { png } from '../fixtures/accommodations.fixture';

describe('ACC-031 local StoragePort adapter', () => {
  let root: string; let storage: LocalStorageAdapter;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'acc-photos-')); storage = new LocalStorageAdapter(root); });

  it('writes atomically and returns a 64-hex key under the configured root', async () => {
    const key = await storage.store(png);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(await readFile(join(root, key))).toEqual(png);
    expect((await readdir(root)).some((name) => name.endsWith('.tmp'))).toBe(false);
  });

  it('rejects a path-like key on remove and leaves unrelated files in place', async () => {
    const key = await storage.store(png);
    await writeFile(join(root, 'keep'), 'ok');
    await storage.remove(`../${key}`);
    await storage.remove('not-a-key');
    expect(await readdir(root)).toEqual(expect.arrayContaining([key, 'keep']));
  });

  it('removes a stored object by its key', async () => {
    const key = await storage.store(png);
    await storage.remove(key);
    expect(await readdir(root)).toEqual([]);
  });
});
