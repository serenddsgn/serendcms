import type { Inline } from './blocks.js';
import { splitParagraphs } from './inline-markup.js';

/** Kontext für datengetriebene Blöcke und Link-/Medienauflösung. */
export interface MarkdownContext {
  projects: { title: string; url: string; year: number; categories: string[] }[];
  services: { name: string; description: string }[];
  /** Löst Link-Ziele zu Pfaden auf; unbekannte Ziele liefern null. */
  resolveLink: (target: unknown) => string | null;
  mediaAlt: (mediaId: string) => string | null;
  email: string;
}

export function inlineToMarkdown(runs: Inline | null | undefined): string {
  if (!runs) return '';
  return runs
    .map((r) => {
      let t = r.text;
      if (r.em) t = `*${t}*`;
      if (r.href) t = `[${t}](${r.href})`;
      return t;
    })
    .join('');
}

const plain = (runs: Inline) => runs.map((r) => r.text).join('');

type AnyBlock = { type: string } & Record<string, unknown>;

/** Serialisiert Blöcke (Seiten und Projekte) deterministisch nach Markdown. */
export function blocksToMarkdown(blocks: readonly unknown[], ctx: MarkdownContext): string {
  const out: string[] = [];
  let chapterNo = 0;
  for (const raw of blocks) {
    const b = raw as AnyBlock;
    switch (b.type) {
      case 'hero': {
        const lines = (b.headline as Inline[]).map(plain).join(' ');
        out.push(`# ${lines}`, String(b.intro));
        break;
      }
      case 'featured_projects':
        out.push(`## ${String(b.label)}`, ...ctx.projects.map(projectLine));
        break;
      case 'services_overview':
        out.push(
          `## ${plain(b.title as Inline)}`,
          ...ctx.services.map((s) => `- **${s.name}**: ${s.description}`),
        );
        break;
      case 'media_text_card': {
        const alt = ctx.mediaAlt(String(b.mediaId));
        out.push(`## ${plain(b.heading as Inline)}`, String(b.text));
        if (alt) out.push(`_Bild: ${alt}_`);
        break;
      }
      case 'image': {
        const text = (b.caption ? String(b.caption) : null) ?? ctx.mediaAlt(String(b.mediaId));
        if (text) out.push(`_Bild: ${text}_`);
        break;
      }
      case 'contact_cta':
        out.push(`## ${String(b.line1)} ${String(b.line2)}`, `${String(b.eyebrow)}: ${ctx.email}`);
        break;
      case 'page_title':
        out.push(`# ${String(b.title)}`);
        if (b.intro) out.push(String(b.intro));
        break;
      case 'project_index':
        out.push(...ctx.projects.map(projectLine));
        break;
      case 'chapter': {
        chapterNo += 1;
        out.push(
          `## ${String(chapterNo).padStart(2, '0')} · ${String(b.title)}`,
          inlineToMarkdown(b.lead as Inline),
          ...(b.body as Inline[]).map(inlineToMarkdown),
        );
        break;
      }
      case 'quote':
        out.push((b.lines as Inline[]).map((l) => `> ${inlineToMarkdown(l)}`).join('\n>\n'));
        break;
      case 'interactive_demo': {
        const demo = b.demo as { title: string; eyebrow: string };
        out.push(
          `## ${demo.title}`,
          `_${demo.eyebrow}_ (interaktive Demo, nur im Browser nutzbar)`,
        );
        break;
      }
      case 'process': {
        out.push(
          `## ${String(b.eyebrow)}`,
          (b.steps as { title: string; text: string }[])
            .map((st, i) => `${i + 1}. **${st.title}**${st.text ? `: ${st.text}` : ''}`)
            .join('\n'),
        );
        break;
      }
      case 'heading':
        out.push(`${'#'.repeat(Number(b.level))} ${String(b.text)}`);
        break;
      case 'richtext':
        for (const n of b.nodes as {
          kind: string;
          runs?: Inline;
          ordered?: boolean;
          items?: Inline[];
        }[]) {
          if (n.kind === 'paragraph' && n.runs)
            for (const p of splitParagraphs(n.runs)) out.push(inlineToMarkdown(p));
          if (n.kind === 'list' && n.items) {
            out.push(
              n.items
                .map((it, i) => `${n.ordered ? `${i + 1}.` : '-'} ${inlineToMarkdown(it)}`)
                .join('\n'),
            );
          }
        }
        break;
      default:
        break;
    }
  }
  return out.join('\n\n') + '\n';
}

function projectLine(p: MarkdownContext['projects'][number]): string {
  return `- [${p.title}](${p.url}) (${p.year}, ${p.categories.join(', ')})`;
}
