/**
 * Bildpipeline: AVIF/WebP mit width, height, srcset und sizes. Varianten entstehen über statische
 * Endpunkte (/img/<hash>-<breite>.<format>) und werden zwischen Builds im Cache wiederverwendet.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import type { BuildMedia } from '@serend/schema';
import { CACHE_DIR, PREVIEW_MODE, data, readOriginal } from './data';

export const WIDTHS = [480, 800, 1200, 1800, 2400];
export const FORMATS = ['avif', 'webp'] as const;
export type Format = (typeof FORMATS)[number];

export const widthsFor = (m: Pick<BuildMedia, 'width'>): number[] => {
  const w = WIDTHS.filter((x) => x < m.width);
  return [...w, m.width > WIDTHS[WIDTHS.length - 1]! ? WIDTHS[WIDTHS.length - 1]! : m.width];
};

export const variantName = (m: Pick<BuildMedia, 'sha256'>, width: number, format: Format) =>
  `${m.sha256.slice(0, 12)}-${width}.${format}`;
// Der Node-Adapter behandelt URLs mit Dateiendung als statische Dateien. Die SSR-Vorschau nutzt deshalb
// endungslose Bild-URLs (/preview-img/<hash>-<breite>-<format>), der statische Build die üblichen /img/<datei>.
const variantUrl = (m: BuildMedia, width: number, format: Format) =>
  PREVIEW_MODE
    ? `/preview-img/${m.sha256.slice(0, 12)}-${width}-${format}`
    : `/img/${variantName(m, width, format)}`;

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

/** Löst `<sha12>-<breite>.<format>` zu einer Variante auf (für den dynamischen Bild-Endpunkt der Vorschau). */
export function findVariant(
  file: string,
): { media: BuildMedia; width: number; format: Format } | undefined {
  const m = /^([0-9a-f]{12})-(\d+)[.-](avif|webp)$/.exec(file);
  if (!m) return undefined;
  const media = data().media.find((x) => x.sha256.startsWith(m[1]!));
  const width = Number(m[2]);
  if (!media || !widthsFor(media).includes(width)) return undefined;
  return { media, width, format: m[3] as Format };
}
