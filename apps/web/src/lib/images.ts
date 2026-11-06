/**
 * Bildpipeline: AVIF/WebP mit width, height, srcset und sizes. Varianten entstehen über statische
 * Endpunkte (/img/<hash>-<breite>.<format>) und werden zwischen Builds im Cache wiederverwendet.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import type { BuildMedia } from '@serend/schema';
import { CACHE_DIR, data, readOriginal } from './data';

export const WIDTHS = [480, 800, 1200, 1800, 2400];
export const FORMATS = ['avif', 'webp'] as const;
export type Format = (typeof FORMATS)[number];

export const widthsFor = (m: Pick<BuildMedia, 'width'>): number[] => {
  const w = WIDTHS.filter((x) => x < m.width);
  return [...w, m.width > WIDTHS[WIDTHS.length - 1]! ? WIDTHS[WIDTHS.length - 1]! : m.width];
};

export const variantName = (m: Pick<BuildMedia, 'sha256'>, width: number, format: Format) =>
  `${m.sha256.slice(0, 12)}-${width}.${format}`;
const variantUrl = (m: BuildMedia, width: number, format: Format) =>
  `/img/${variantName(m, width, format)}`;

export interface PictureData {
  width: number;
  height: number;
  avif: string;
  webp: string;
  src: string;
}

export function pictureData(mediaId: string): PictureData {
  const m = data().mediaById.get(mediaId);
  if (!m) throw new Error(`Medium ${mediaId} fehlt im Build-Datenstand`);
  const widths = widthsFor(m);
  const srcset = (f: Format) => widths.map((w) => `${variantUrl(m, w, f)} ${w}w`).join(', ');
  const mid = widths.find((w) => w >= 800) ?? widths[widths.length - 1]!;
  return {
    width: m.width,
    height: m.height,
    avif: srcset('avif'),
    webp: srcset('webp'),
    src: variantUrl(m, mid, 'webp'),
  };
}

/** Alle Varianten, die gebaut werden müssen (für getStaticPaths des Bild-Endpunkts). */
export function allVariants(): {
  file: string;
  media: BuildMedia;
  width: number;
  format: Format;
}[] {
  const out = [];
  for (const m of data().media) {
    for (const width of widthsFor(m))
      for (const format of FORMATS)
        out.push({ file: variantName(m, width, format), media: m, width, format });
  }
  return out;
}

export async function renderVariant(m: BuildMedia, width: number, format: Format): Promise<Buffer> {
  const cached = join(CACHE_DIR, 'variants', variantName(m, width, format));
  if (existsSync(cached)) return readFile(cached);
  const pipeline = sharp(await readOriginal(m))
    .rotate()
    .resize({ width, withoutEnlargement: true });
  const buf =
    format === 'avif'
      ? await pipeline.avif({ quality: 52, effort: 3 }).toBuffer()
      : await pipeline.webp({ quality: 76 }).toBuffer();
  await mkdir(join(CACHE_DIR, 'variants'), { recursive: true });
  await writeFile(cached, buf);
  return buf;
}
