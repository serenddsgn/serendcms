import sharp from 'sharp';
import { AppError } from './errors.js';

export interface DetectedImage {
  mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';
  ext: 'jpg' | 'png' | 'webp' | 'avif';
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Dateityp ausschließlich per Magic Bytes; Dateiname und Client-MIME werden ignoriert. SVG ist bewusst ausgeschlossen. */
export function detectImageType(b: Buffer): DetectedImage | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.length >= 8 && b.subarray(0, 8).equals(PNG_SIGNATURE))
    return { mime: 'image/png', ext: 'png' };
  if (
    b.length >= 12 &&
    b.toString('latin1', 0, 4) === 'RIFF' &&
    b.toString('latin1', 8, 12) === 'WEBP'
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  if (b.length >= 12 && b.toString('latin1', 4, 8) === 'ftyp') {
    const brand = b.toString('latin1', 8, 12);
    if (brand === 'avif' || brand === 'avis') return { mime: 'image/avif', ext: 'avif' };
  }
  return null;
}

const EXPECTED_FORMAT: Record<DetectedImage['mime'], string[]> = {
  'image/jpeg': ['jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/avif': ['heif', 'avif'],
};

const MAX_PIXELS = 100_000_000;

/** Prüft, dass die Datei wirklich ein dekodierbares Bild des erkannten Typs ist, und liefert die Maße. */
export async function inspectImage(
  buffer: Buffer,
  detected: DetectedImage,
): Promise<{ width: number; height: number }> {
  try {
    const meta = await sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: 'error' }).metadata();
    if (
      !meta.width ||
      !meta.height ||
      !meta.format ||
      !EXPECTED_FORMAT[detected.mime].includes(meta.format)
    ) {
      throw new Error('format mismatch');
    }
    return { width: meta.width, height: meta.height };
  } catch {
    throw new AppError(415, 'unsupported_media_type', 'Die Datei ist kein gültiges Bild.');
  }
}
