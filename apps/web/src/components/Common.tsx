import type { Inline } from '@serend/schema';
import { data } from '../lib/data';
import { pictureData } from '../lib/images';

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
  const p = pictureData(mediaId);
  const m = data().mediaById.get(mediaId)!;
  const pos = focal ? `object-position:${m.focalX}% ${m.focalY}%;` : '';
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
