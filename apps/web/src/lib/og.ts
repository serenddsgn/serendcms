import sharp from 'sharp';
import type { BuildMedia } from '@serend/schema';
import { readOriginal } from './data';

const W = 1200;
const H = 630;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function wrap(text: string, max = 22): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if ((line + ' ' + word).trim().length > max && line) {
      lines.push(line);
      line = word;
    } else line = `${line} ${word}`.trim();
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

/** OG-Bild 1200×630: Cover (Fokuspunkt beachtet), dunkler Verlauf unten, Titel und Wortmarke. */
export async function renderOg(opts: {
  title: string;
  siteName: string;
  cover?: BuildMedia | undefined;
  color?: string | undefined;
}): Promise<Buffer> {
  const bg = opts.color ?? '#0a0a0a';
  const base = opts.cover
    ? await sharp(await readOriginal(opts.cover))
        .rotate()
        .resize(W, H, { fit: 'cover', position: sharp.strategy.attention })
        .toBuffer()
    : await sharp({ create: { width: W, height: H, channels: 3, background: '#0a0a0a' } })
        .png()
        .toBuffer();
  const lines = wrap(opts.title);
  const size = lines.length > 2 ? 64 : 80;
  const startY = H - 70 - (lines.length - 1) * (size + 6);
  const text = lines
    .map(
      (l, i) =>
        `<text x="72" y="${startY + i * (size + 6)}" font-family="Plus Jakarta Sans, Inter, Helvetica, Arial, sans-serif" font-weight="800" font-size="${size}" letter-spacing="-2" fill="#f5f5f4">${esc(l)}</text>`,
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0.35" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.82"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="${opts.cover ? 'none' : bg}" opacity="${opts.cover ? 1 : 0}"/>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <text x="72" y="84" font-family="Geist Mono, Menlo, monospace" font-size="24" letter-spacing="2" fill="#f5f5f4">${esc(opts.siteName.toUpperCase())}</text>
    ${text}
  </svg>`;
  return sharp(base)
    .composite([{ input: Buffer.from(svg) }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}
