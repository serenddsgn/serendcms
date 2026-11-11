import { splitEmphasis, type BuildProject, type Inline } from '@serend/schema';
import { data, firstStripMedia } from '../lib/data';
import { isVideo, pictureData, videoData } from '../lib/images';

export const ArrowIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    aria-hidden="true"
  >
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

/** Inline-Text mit Marken: Liquid-Schlüsselwörter, Kursiv, Links. */
export function Runs({ runs }: { runs: Inline }) {
  return (
    <>
      {runs.map((r) => {
        let node = <>{r.text}</>;
        if (r.liquid) node = <span class="liquid">{r.text}</span>;
        if (r.em) node = <em>{node}</em>;
        if (r.href)
          node = (
            <a href={r.href} style="text-decoration: underline; text-underline-offset: 4px">
              {node}
            </a>
          );
        return node;
      })}
    </>
  );
}

/**
 * Hinweis für den Seitenübergang: das erste Bild der Projektseite. site.ts lädt es beim Hover vor, damit der Morph
 * auf ein fertiges Bild trifft. Die Größenangabe muss zum Streifen der Projektseite passen (Project.tsx).
 */
export function vtAttrs(p: BuildProject): Record<string, string> {
  const id = firstStripMedia(p);
  return id ? { 'data-vt-srcset': pictureData(id).avif } : {};
}

/** Klartext mit `**Schlüsselwörtern**`: sie stehen in voller Textfarbe, der Rest bleibt gedämpft. */
export function Emphasis({ text }: { text: string }) {
  return (
    <>
      {splitEmphasis(text).map((p) => (p.strong ? <strong class="kw">{p.text}</strong> : p.text))}
    </>
  );
}

export function BigLink({
  href,
  label,
  size = 64,
  class: cls = '',
  style = '',
}: {
  href: string;
  label: string;
  size?: number;
  class?: string;
  style?: string;
}) {
  return (
    <a class={`biglink ${cls}`} href={href} style={style}>
      <span class="ring" style={`width:${size}px;height:${size}px`}>
        <ArrowIcon size={size > 56 ? 16 : 14} />
      </span>
      {label}
    </a>
  );
}

interface PictureProps {
  mediaId: string;
  alt: string;
  sizes: string;
  eager?: boolean;
  focal?: boolean;
  style?: string;
}

/** `<picture>` mit AVIF/WebP, width/height, srcset und sizes. */
export function Picture({
  mediaId,
  alt,
  sizes,
  eager = false,
  focal = false,
  style = '',
}: PictureProps) {
  const m = data().mediaById.get(mediaId)!;
  const pos = focal ? `object-position:${m.focalX}% ${m.focalY}%;` : '';
  if (isVideo(m)) {
    // Stummes Endlosvideo wie ein bewegtes Bild; site.ts spielt es nur im Sichtfeld ab (und nicht bei reduzierter Bewegung).
    // Der Fragment-Zeitstempel zeigt ohne Skript und vor dem Abspielen das erste Bild.
    const v = videoData(mediaId);
    // role="img" macht das Label zulässig (stummes Bewegtbild ohne Steuerung); ohne Alt-Text rein dekorativ
    const a11y: Record<string, string> = alt
      ? { role: 'img', 'aria-label': alt }
      : { 'aria-hidden': 'true' };
    return (
      <video
        class="vid"
        src={`${v.src}#t=0.001`}
        width={v.width}
        height={v.height}
        {...a11y}
        muted
        loop
        playsinline
        preload={eager ? 'auto' : 'metadata'}
        disablepictureinpicture
        data-autoplay
        style={pos + style}
      />
    );
  }
  const p = pictureData(mediaId);
  const priority: Record<string, string> = eager ? { fetchpriority: 'high' } : {};
  return (
    <picture>
      <source type="image/avif" srcset={p.avif} sizes={sizes} />
      <source type="image/webp" srcset={p.webp} sizes={sizes} />
      <img
        src={p.src}
        width={p.width}
        height={p.height}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        style={pos + style}
        {...priority}
      />
    </picture>
  );
}
