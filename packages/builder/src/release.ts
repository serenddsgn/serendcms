import { cp, lstat, mkdir, readdir, readlink, rename, rm, symlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { randomBytes } from 'node:crypto';

/** Symlink `current` zeigt immer auf genau ein Release-Verzeichnis. */
export const CURRENT = 'current';

export const releasePath = (releasesDir: string, releaseId: string) => join(releasesDir, releaseId);

export async function currentReleaseId(releasesDir: string): Promise<string | undefined> {
  try {
    return basename(await readlink(join(releasesDir, CURRENT)));
  } catch {
    return undefined;
  }
}

/** Kopiert das Build-Ergebnis nach releases/<id> (Upload). */
export async function storeRelease(
  releasesDir: string,
  releaseId: string,
  sourceDir: string,
): Promise<void> {
  const target = releasePath(releasesDir, releaseId);
  await mkdir(releasesDir, { recursive: true });
  await cp(sourceDir, target, { recursive: true, errorOnExist: true, force: false });
}

/**
 * Schaltet `current` atomar um: neuer Symlink unter temporärem Namen, dann `rename` über den alten
 * (rename ist atomar, Besucher sehen nie einen Zwischenzustand).
 */
export async function switchCurrent(releasesDir: string, releaseId: string): Promise<void> {
  const dir = releasePath(releasesDir, releaseId);
  await lstat(dir); // wirft, wenn das Release nicht existiert
  const tmp = join(releasesDir, `.${CURRENT}.${randomBytes(4).toString('hex')}`);
  await symlink(releaseId, tmp, 'dir'); // relativ, damit das Verzeichnis verschiebbar bleibt
  try {
    await rename(tmp, join(releasesDir, CURRENT));
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

/** Entfernt Release-Verzeichnisse, die nicht in `keep` stehen. Gibt die entfernten IDs zurück. */
export async function pruneReleases(releasesDir: string, keep: Set<string>): Promise<string[]> {
  const removed: string[] = [];
  let entries: string[];
  try {
    entries = await readdir(releasesDir);
  } catch {
    return removed;
  }
  for (const name of entries) {
    if (name === CURRENT || name.startsWith('.') || keep.has(name)) continue;
    await rm(join(releasesDir, name), { recursive: true, force: true });
    removed.push(name);
  }
  return removed;
}
