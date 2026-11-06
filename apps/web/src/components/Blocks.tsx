import type { Locale } from '@serend/schema';
import type { ChapterEntry } from './Project';
import {
  ContactCta,
  FeaturedProjects,
  Heading,
  Hero,
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
  const rich = blocks.filter((b) => b.type === 'heading' || b.type === 'richtext');
  const out = [];
  let richDone = false;
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
        out.push(<PageTitle b={b} locale={locale} count={projectCount} />);
        break;
      case 'project_index':
        out.push(<ProjectIndex b={b} locale={locale} />);
        break;
      case 'heading':
      case 'richtext':
        if (!richDone) {
          richDone = true;
          out.push(
            <section class="section side" style="padding-bottom:96px">
              <div class="hide-m" />
              <div style="max-width:760px">
                {rich.map((r) =>
                  r.type === 'heading' ? <Heading b={r as never} /> : <RichText b={r as never} />,
                )}
              </div>
            </section>,
          );
        }
        break;
    }
  }
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
  | { type: 'chapters'; first: boolean; items: { b: Block; no: number }[] }
  | { type: 'quote'; b: Block }
  | { type: 'demo'; b: Block };

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
    group = undefined;
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
