import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { StorageNotFoundError, type Storage } from './storage.js';

/** Schlüssel werden vom Server erzeugt; zusätzlich wird jeder Zugriff gegen Path Traversal geprüft. */
const KEY_PATTERN = /^[a-z0-9][a-z0-9/_-]*\.[a-z0-9]{2,5}$/;

export function createLocalStorage(rootDir: string): Storage {
  const root = resolve(rootDir);
  function pathFor(key: string): string {
    if (!KEY_PATTERN.test(key) || key.includes('..') || key.includes('//')) {
      throw new Error('invalid storage key');
    }
    const full = resolve(root, key);
    if (!full.startsWith(root + sep)) throw new Error('invalid storage key');
    return full;
  }
  return {
    async put(key, data) {
      const file = pathFor(key);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, data, { flag: 'wx', mode: 0o640 });
    },
    async get(key) {
      try {
        return await readFile(pathFor(key));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new StorageNotFoundError(key);
        throw err;
      }
    },
    async delete(key) {
      await rm(pathFor(key), { force: true });
    },
  };
}
