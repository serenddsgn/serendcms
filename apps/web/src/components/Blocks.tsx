import type { Locale } from '@serend/schema';
import type { ChapterEntry } from './Project';
import {
  ContactCta,
  FeaturedProjects,
  Heading,
  Hero,
  ImageFigure,
  MediaTextCard,
  PageTitle,
  ProjectIndex,
  RichText,
  ServicesOverview,
} from './Sections';

/** Rendert Blöcke von Systemseiten und Inhaltsseiten (ohne Hydration). */
export function PageBlocks({
  blocks,
  locale,
  projectCount,
}: {
  blocks: { type: string }[];
  locale: Locale;
  projectCount: number;
}) {
  const out = [];
  // Überschriften, Texte und Bilder in Textspaltenbreite stehen in der Reihenfolge des Admins in einer gemeinsamen Spalte.
  // Ein Bild in „Volle Breite“ beendet die Spalte und steht in eigener Zeile; danach beginnt sie neu.
  let column: unknown[] = [];
  const flush = () => {
    if (column.length === 0) return;
    out.push(
      <section class="section side" style="padding-bottom:48px">
        <div class="hide-m" />
        <div style="max-width:760px">{column}</div>
      </section>,
    );
    column = [];
  };
  for (const raw of blocks) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = raw as any;
    switch (b.type) {
      case 'hero':
        out.push(<Hero b={b} />);
        break;
      case 'featured_projects':
        out.push(<FeaturedProjects b={b} locale={locale} />);
        break;
      case 'services_overview':
        out.push(<ServicesOverview b={b} locale={locale} />);
        break;
      case 'media_text_card':
        out.push(<MediaTextCard b={b} locale={locale} />);
        break;
      case 'contact_cta':
        out.push(<ContactCta b={b} locale={locale} />);
        break;
      case 'page_title':
        flush();
        out.push(<PageTitle b={b} locale={locale} count={projectCount} />);
        break;
      case 'project_index':
        out.push(<ProjectIndex b={b} locale={locale} />);
        break;
      case 'heading':
        column.push(<Heading b={b} />);
        break;
      case 'richtext':
        column.push(<RichText b={b} />);
        break;
      case 'image':
        if (b.size === 'full') {
          flush();
          out.push(
            <section class="section" style="padding-bottom:48px">
              <ImageFigure b={b} locale={locale} />
            </section>,
          );
        } else {
          column.push(<ImageFigure b={b} locale={locale} />);
        }
        break;
    }
  }
  flush();
  return <>{out}</>;
}

export type Block = {
  type: string;
  id: string;
  anchor?: string;
  navLabel?: string;
  title?: string;
};
export type Segment =
  /** Textspalte: Kapitel (mit Nummer) und Bilder in Spaltenbreite stehen in der Reihenfolge des Admins zusammen. */
  | { type: 'chapters'; first: boolean; items: { b: Block; no: number }[] }
  | { type: 'quote'; b: Block }
  | { type: 'demo'; b: Block }
  /** Bild über die volle Seitenbreite */
  | { type: 'image-full'; b: Block }
  | { type: 'gallery'; b: Block };

/**
 * Ordnet die Blöcke eines Projekts: aufeinanderfolgende Kapitel bilden eine Gruppe (die erste mit der
 * sticky Kapitel-Navigation), Zitate und Demos stehen in voller Breite dazwischen.
 */
export function planProject(blocks: Block[]): { entries: ChapterEntry[]; segments: Segment[] } {
  const entries: ChapterEntry[] = [];
  const segments: Segment[] = [];
  let n = 0;
  let group: Extract<Segment, { type: 'chapters' }> | undefined;
  for (const b of blocks) {
    if (b.type === 'chapter') {
      n += 1;
      entries.push({
        n: String(n).padStart(2, '0'),
        label: b.title ?? '',
        href: `#${b.anchor ?? `kapitel-${n}`}`,
      });
      if (!group) {
        group = {
          type: 'chapters',
          first: !segments.some((s) => s.type === 'chapters'),
          items: [],
        };
        segments.push(group);
      }
      group.items.push({ b, no: n });
      continue;
    }
    // Bilder in Spaltenbreite bleiben in der laufenden Textspalte, sonst beginnen sie eine eigene
    if (b.type === 'image' && (b as Block & { size?: string }).size !== 'full') {
      if (!group) {
        group = {
          type: 'chapters',
          first: !segments.some((s) => s.type === 'chapters'),
          items: [],
        };
        segments.push(group);
      }
      group.items.push({ b, no: 0 });
      continue;
    }
    group = undefined;
    if (b.type === 'image') segments.push({ type: 'image-full', b });
    if (b.type === 'gallery') segments.push({ type: 'gallery', b });
    if (b.type === 'quote') segments.push({ type: 'quote', b });
    if (b.type === 'interactive_demo') {
      entries.push({
        n: '↳',
        label: b.navLabel ?? '',
        href: `#${b.anchor ?? `demo-${b.id.slice(0, 8)}`}`,
      });
      segments.push({ type: 'demo', b });
    }
  }
  return { entries, segments };
}
