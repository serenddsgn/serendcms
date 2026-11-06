import { copyFile, mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { maintenanceMode, type Database } from '@serend/db';
import type { MaintenanceDto } from '@serend/schema';
import type { AppConfig } from '../config.js';
import { AppError, errors } from '../lib/errors.js';
import { renderMaintenancePage } from '../lib/maintenance-page.js';
import { signPassToken, verifyPassToken } from '../lib/pass-token.js';
import { mediaRepo } from '../repositories/media.repo.js';
import type { Storage } from '../storage/storage.js';

export const FLAG_FILE = 'on';

type Row = typeof maintenanceMode.$inferSelect;
const toDto = (r: Row): MaintenanceDto => ({
  enabled: r.enabled,
  headlineDe: r.headlineDe,
  headlineEn: r.headlineEn,
  logoMediaId: r.logoMediaId,
  updatedAt: r.updatedAt.toISOString(),
});

/**
 * Wartungsmodus: Caddy prüft die Flag-Datei `on` (ohne das Backend zu fragen) und liefert dann die statische Wartungsseite
 * mit Status 503. Besucher mit gültigem Zugangs-Cookie (Einmal-Link aus dem Admin) sehen die normale Seite.
 */
export function createMaintenanceService({
  db,
  storage,
  config,
  log,
}: {
  db: Database;
  storage: Storage;
  config: Pick<AppConfig, 'maintenance' | 'previewSigningKey' | 'siteOrigin' | 'cookieSecure'>;
  log?: { error: (obj: unknown, msg: string) => void };
}) {
  const dir = config.maintenance.dir;

  async function row(): Promise<Row> {
    const [r] = await db.select().from(maintenanceMode).limit(1);
    if (r) return r;
    const [created] = await db.insert(maintenanceMode).values({}).onConflictDoNothing().returning();
    return created ?? (await db.select().from(maintenanceMode).limit(1))[0]!;
  }

  /** Schreibt Seite, Logo und Flag. Idempotent; wird bei jeder Änderung und beim Start der API aufgerufen. */
  async function apply(): Promise<void> {
    const r = await row();
    await mkdir(join(dir, 'fonts'), { recursive: true });
    try {
      for (const f of await readdir(config.maintenance.fontsDir)) {
        if (f.endsWith('.woff2'))
          await copyFile(join(config.maintenance.fontsDir, f), join(dir, 'fonts', f));
      }
    } catch (err) {
      log?.error(
        { errName: err instanceof Error ? err.name : 'Error' },
        'Schriften für die Wartungsseite fehlen',
      );
    }

    let hasLogo = false;
    if (r.logoMediaId) {
      const [m] = await mediaRepo(db).findManyByIds([r.logoMediaId]);
      if (m) {
        const webp = await sharp(await storage.get(m.storageKey))
          .rotate()
          .resize({ height: 132, withoutEnlargement: true, fit: 'inside' })
          .webp({ quality: 88 })
          .toBuffer();
        await writeFile(join(dir, 'logo.webp'), webp);
        hasLogo = true;
      }
    }
    if (!hasLogo) await rm(join(dir, 'logo.webp'), { force: true });

    const tmp = join(dir, `.maintenance.${process.pid}.tmp`);
    await writeFile(
      tmp,
      renderMaintenancePage({ headlineDe: r.headlineDe, headlineEn: r.headlineEn, hasLogo }),
    );
    await rename(tmp, join(dir, 'maintenance.html'));
    // Das Flag kommt zuletzt: sobald es existiert, ist die Seite vollständig.
    if (r.enabled) await writeFile(join(dir, FLAG_FILE), new Date().toISOString());
    else await rm(join(dir, FLAG_FILE), { force: true });
  }

  return {
    apply,

    async get(): Promise<MaintenanceDto> {
      return toDto(await row());
    },

    async update(
      actorId: string,
      body: {
        enabled: boolean;
        headlineDe: string;
        headlineEn: string;
        logoMediaId: string | null;
      },
    ): Promise<MaintenanceDto> {
      if (
        body.logoMediaId &&
        (await mediaRepo(db).findManyByIds([body.logoMediaId])).length === 0
      ) {
        throw new AppError(400, 'validation_error', 'Das Logo existiert nicht.');
      }
      await row();
      const [updated] = await db
        .update(maintenanceMode)
        .set({ ...body, updatedBy: actorId, updatedAt: sql`now()` })
        .where(eq(maintenanceMode.singleton, true))
        .returning();
      await apply();
      return toDto(updated!);
    },

    /** Einmal-Link für eingeloggte Redakteure: schaltet die echte Seite für diesen Browser frei. */
    passLink(): { url: string; expiresAt: string } {
      const { token, expiresAt } = signPassToken(config.previewSigningKey, 'enter');
      return {
        url: `${config.siteOrigin}/__maintenance/enter?token=${token}`,
        expiresAt: expiresAt.toISOString(),
      };
    },

    /** Tauscht den Einmal-Link gegen den Wert des Zugangs-Cookies. */
    enter(token: string): { cookie: string; expiresAt: Date } {
      if (!verifyPassToken(config.previewSigningKey, 'enter', token))
        throw errors.forbidden('Der Link ist ungültig oder abgelaufen.');
      const { token: cookie, expiresAt } = signPassToken(config.previewSigningKey, 'pass');
      return { cookie, expiresAt };
    },

    /** Von Caddy (forward_auth) aufgerufen: gültiges Zugangs-Cookie? */
    isPassed(cookie: string | undefined): boolean {
      return !!cookie && verifyPassToken(config.previewSigningKey, 'pass', cookie);
    },
  };
}

export type MaintenanceService = ReturnType<typeof createMaintenanceService>;
