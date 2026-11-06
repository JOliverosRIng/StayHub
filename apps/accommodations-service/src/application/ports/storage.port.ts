export const STORAGE_PORT = Symbol('STORAGE_PORT');

/** Opaque object storage for photo bytes. Keys never appear in HTTP responses. */
export interface StoragePort {
  store(content: Uint8Array): Promise<string>;
  remove(storageKey: string): Promise<void>;
}
