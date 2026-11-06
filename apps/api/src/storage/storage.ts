/** Storage-Interface: In der DB stehen nur Metadaten und der `storage_key`. */
export interface Storage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

export class StorageNotFoundError extends Error {
  constructor(key: string) {
    super(`storage key not found: ${key}`);
    this.name = 'StorageNotFoundError';
  }
}
