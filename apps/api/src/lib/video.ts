import { AppError } from './errors.js';

export interface DetectedVideo {
  mime: 'video/mp4' | 'video/webm';
  ext: 'mp4' | 'webm';
}

/** Marken, die zu Standbildern gehören (AVIF/HEIC) – diese sind keine Videos. */
const STILL_BRANDS = new Set(['avif', 'avis', 'heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1']);

/** Dateityp ausschließlich per Magic Bytes: MP4/MOV-Container (ftyp) und WebM (EBML). */
export function detectVideoType(b: Buffer): DetectedVideo | null {
  if (b.length >= 12 && b.toString('latin1', 4, 8) === 'ftyp') {
    if (!STILL_BRANDS.has(b.toString('latin1', 8, 12))) return { mime: 'video/mp4', ext: 'mp4' };
  }
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3)
    return { mime: 'video/webm', ext: 'webm' };
  return null;
}

// ── MP4: moov → trak → tkhd (Breite/Höhe als 16.16-Festkomma) ───────────────────────────────
interface Box {
  type: string;
  start: number; // Beginn des Inhalts
  end: number;
}

function* boxes(b: Buffer, from: number, to: number): Generator<Box> {
  let pos = from;
  while (pos + 8 <= to) {
    let size = b.readUInt32BE(pos);
    const type = b.toString('latin1', pos + 4, pos + 8);
    let header = 8;
    if (size === 1) {
      if (pos + 16 > to) return;
      size = Number(b.readBigUInt64BE(pos + 8));
      header = 16;
    } else if (size === 0) {
      size = to - pos;
    }
    if (size < header || pos + size > to) return;
    yield { type, start: pos + header, end: pos + size };
    pos += size;
  }
}

function mp4Dimensions(b: Buffer): { width: number; height: number } | null {
  for (const moov of boxes(b, 0, b.length)) {
    if (moov.type !== 'moov') continue;
    for (const trak of boxes(b, moov.start, moov.end)) {
      if (trak.type !== 'trak') continue;
      for (const tkhd of boxes(b, trak.start, trak.end)) {
        if (tkhd.type !== 'tkhd') continue;
        const version = b[tkhd.start];
        // Breite und Höhe sind die letzten 8 Bytes der Box; Tonspuren haben 0×0.
        if (tkhd.end - tkhd.start < (version === 1 ? 92 : 80)) continue;
        const width = b.readUInt32BE(tkhd.end - 8) / 65536;
        const height = b.readUInt32BE(tkhd.end - 4) / 65536;
        if (width >= 1 && height >= 1)
          return { width: Math.round(width), height: Math.round(height) };
      }
    }
  }
  return null;
}

// ── WebM: EBML → Segment → Tracks → TrackEntry → Video (PixelWidth/PixelHeight) ─────────────
const ID = {
  segment: 0x18538067,
  tracks: 0x1654ae6b,
  trackEntry: 0xae,
  video: 0xe0,
  pixelWidth: 0xb0,
  pixelHeight: 0xba,
} as const;
const CONTAINERS = new Set<number>([ID.segment, ID.tracks, ID.trackEntry, ID.video]);

function readId(b: Buffer, pos: number): { id: number; len: number } | null {
  const first = b[pos];
  if (first === undefined || first === 0) return null;
  const len = Math.clz32(first) - 23; // führende Nullen im Byte + 1
  if (len > 4 || pos + len > b.length) return null;
  let id = 0;
  for (let i = 0; i < len; i++) id = id * 256 + b[pos + i]!;
  return { id, len };
}

function readSize(b: Buffer, pos: number): { size: number; len: number } | null {
  const first = b[pos];
  if (first === undefined || first === 0) return null;
  const len = Math.clz32(first) - 23;
  if (len > 8 || pos + len > b.length) return null;
  let size = first & (0xff >> len);
  let unknown = size === 0xff >> len;
  for (let i = 1; i < len; i++) {
    const byte = b[pos + i]!;
    if (byte !== 0xff) unknown = false;
    size = size * 256 + byte;
  }
  return { size: unknown ? -1 : size, len };
}

function webmDimensions(b: Buffer): { width: number; height: number } | null {
  let width = 0;
  let height = 0;
  const walk = (from: number, to: number): void => {
    let pos = from;
    while (pos < to && !(width && height)) {
      const id = readId(b, pos);
      if (!id) return;
      const sz = readSize(b, pos + id.len);
      if (!sz) return;
      const body = pos + id.len + sz.len;
      const end = sz.size < 0 ? to : Math.min(to, body + sz.size);
      if (CONTAINERS.has(id.id)) walk(body, end);
      else if (id.id === ID.pixelWidth || id.id === ID.pixelHeight) {
        let v = 0;
        for (let i = body; i < end; i++) v = v * 256 + b[i]!;
        if (id.id === ID.pixelWidth) width ||= v;
        else height ||= v;
      }
      pos = end;
    }
  };
  walk(0, b.length);
  return width && height ? { width, height } : null;
}

const MAX_SIDE = 16_384;

/** Liest die Abmessungen aus dem Container (ohne Dekodierung); ungültige Dateien werden abgelehnt. */
export function inspectVideo(
  buffer: Buffer,
  detected: DetectedVideo,
): { width: number; height: number } {
  const dims = (() => {
    try {
      return detected.ext === 'mp4' ? mp4Dimensions(buffer) : webmDimensions(buffer);
    } catch {
      return null;
    }
  })();
  if (!dims || dims.width > MAX_SIDE || dims.height > MAX_SIDE) {
    throw new AppError(415, 'unsupported_media_type', 'Die Datei ist kein gültiges Video.');
  }
  return dims;
}
