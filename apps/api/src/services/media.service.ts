import { createHash, randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import sharp from 'sharp';
import type { Database } from '@serend/db';
import type { MediaDto, UpdateMediaBody } from '@serend/schema';
import type { z } from 'zod';
import { AppError, errors } from '../lib/errors.js';
import { detectImageType, inspectImage } from '../lib/image.js';
import { isForeignKeyViolation } from '../lib/pg-errors.js';
import { mediaRepo } from '../repositories/media.repo.js';
import { StorageNotFoundError, type Storage } from '../storage/storage.js';
import { toMediaDto } from './dto.js';

function sanitizeFilename(name: string): string {
  const clean = [...basename(name)]
    .filter((ch) => {
      const c = ch.codePointAt(0) ?? 0;
      return c > 0x1f && c !== 0x7f;
    })
    .join('')
    .trim();
  return (clean || 'upload').slice(0, 200);
}

export function createMediaService({ db, storage }: { db: Database; storage: Storage }) {
  const repo = mediaRepo(db);

  async function getRow(id: string) {
    const row = await repo.findById(id);
    if (!row) throw errors.notFound('Medium nicht gefunden.');
    return row;
  }

  return {
    async upload(actorId: string, originalName: string, buffer: Buffer): Promise<MediaDto> {
      const detected = detectImageType(buffer);
      if (!detected) {
        throw new AppError(
          415,
          'unsupported_media_type',
          'Nur JPEG, PNG, WebP und AVIF sind erlaubt.',
        );
      }
      const { width, height } = await inspectImage(buffer, detected);
      const year = new Date().getUTCFullYear();
      const storageKey = `${year}/${randomUUID()}.${detected.ext}`;
      await storage.put(storageKey, buffer);
      try {
        const row = await repo.insert({
          storageKey,
          originalFilename: sanitizeFilename(originalName),
          mime: detected.mime,
          byteSize: buffer.length,
          width,
          height,
          sha256: createHash('sha256').update(buffer).digest('hex'),
          createdBy: actorId,
        });
        return toMediaDto(row, false);
      } catch (err) {
        await storage.delete(storageKey).catch(() => {});
        throw err;
      }
    },

    async list(limit: number, offset: number) {
      const { rows, total } = await repo.list(limit, offset);
      return { media: rows.map((r) => toMediaDto(r, r.inUse)), total };
    },

    async get(id: string): Promise<MediaDto> {
      const row = await getRow(id);
      return toMediaDto(row, row.inUse);
    },

    async update(id: string, patch: z.infer<typeof UpdateMediaBody>): Promise<MediaDto> {
      const current = await getRow(id);
      let altText: Record<string, string> | undefined;
      if (patch.altText) {
        // leere Texte entfernen die Sprache
        altText = Object.fromEntries(
          Object.entries({ ...current.altText, ...patch.altText }).filter(([, v]) => v),
        ) as Record<string, string>;
      }
      const row = await repo.update(id, {
        ...(altText && { altText }),
        ...(patch.focalX !== undefined && { focalX: patch.focalX }),
        ...(patch.focalY !== undefined && { focalY: patch.focalY }),
      });
      if (!row) throw errors.notFound('Medium nicht gefunden.');
      return toMediaDto(row, current.inUse);
    },

    /** Löschen nur ohne Referenzen: die FKs (ON DELETE RESTRICT) sind der eigentliche Schutz. */
    async remove(id: string): Promise<void> {
      let removed;
      try {
        removed = await repo.delete(id);
      } catch (err) {
        if (isForeignKeyViolation(err)) throw errors.conflict('Das Medium wird noch verwendet.');
        throw err;
      }
      if (!removed) throw errors.notFound('Medium nicht gefunden.');
      await storage.delete(removed.storageKey).catch(() => {});
    },

    async file(id: string): Promise<{ buffer: Buffer; mime: string }> {
      const row = await getRow(id);
      try {
        return { buffer: await storage.get(row.storageKey), mime: row.mime };
      } catch (err) {
        if (err instanceof StorageNotFoundError) throw errors.notFound('Datei nicht gefunden.');
        throw err;
      }
    },

    async thumb(id: string, width: number): Promise<Buffer> {
      const { buffer } = await this.file(id);
      return sharp(buffer)
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();
    },
  };
}

export type MediaService = ReturnType<typeof createMediaService>;
