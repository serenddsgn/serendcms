import { z } from 'zod';
import { ContentPageContent, ProjectContent } from './blocks.js';
import { Locale } from './common.js';
import { parseInlineMarkup } from './inline-markup.js';
import { CreatePageBody } from './pages.js';
import { CATEGORIES, CreateProjectBody, HexColor } from './projects.js';

/**
 * Import-Format für Texte, die extern (z. B. mit einer KI) erstellt wurden.
 *
 * Bewusst einfacher als das Block-Schema des CMS: Fließtext steht als Text mit der Inline-Schreibweise
 * (`[[liquid]]`, `*kursiv*`, `[Text](url)`), Bilder werden über den Dateinamen aus der Medienbibliothek
 * angesprochen. `buildImport` macht daraus Entwürfe im echten Schema und meldet Probleme verständlich.
 * Es wird nie veröffentlicht: der Import legt nur Entwürfe an.
 */
export const IMPORT_FORMAT = 'serend-import';
export const IMPORT_VERSION = 1;

const Str = z.string().trim().min(1);
const OptStr = z.string().trim().optional();
const Media = Str.describe('Dateiname aus der Medienbibliothek');

// ── Blöcke in Projekten ───────────────────────────────────────────────
const ImportChapter = z.object({
  type: z.literal('chapter'),
  title: Str,
  lead: Str,
  body: z.array(Str).default([]),
});
const ImportQuote = z.object({ type: z.literal('quote'), lines: z.array(Str).min(1).max(3) });
const ImportImage = z.object({
  type: z.literal('image'),
  media: Media,
  size: z.enum(['small', 'medium', 'large', 'full']).default('medium'),
  caption: OptStr,
});
const ImportGallery = z.object({
  type: z.literal('gallery'),
  layout: z.enum(['strip', 'grid']).default('strip'),
  items: z.array(z.object({ media: Media, caption: OptStr })).min(1),
});
const ImportProjectBlock = z.discriminatedUnion('type', [
  ImportChapter,
  ImportQuote,
  ImportImage,
  ImportGallery,
]);

// ── Blöcke auf Seiten ─────────────────────────────────────────────────
const ImportPageTitle = z.object({
  type: z.literal('page_title'),
  title: Str,
  intro: OptStr,
});
const ImportHeading = z.object({
  type: z.literal('heading'),
  level: z.union([z.literal(2), z.literal(3)]).default(2),
  text: Str,
});
const ImportText = z.object({ type: z.literal('text'), text: Str });
const ImportPageBlock = z.discriminatedUnion('type', [
  ImportPageTitle,
  ImportHeading,
  ImportText,
  ImportImage,
]);

// ── Einträge ──────────────────────────────────────────────────────────
const Common = {
  locale: Locale.default('de'),
  /** Einträge mit gleichem `group` (je Sprache einer) werden als Sprachversionen verknüpft. */
  group: OptStr,
  slug: OptStr,
  title: Str,
  seoTitle: OptStr,
  seoDescription: OptStr,
};
const ImportProject = z.object({
  kind: z.literal('project'),
  ...Common,
  subtitle: OptStr,
  year: z.number().int(),
  categories: z.array(z.enum(CATEGORIES)).min(1),
  color: HexColor.optional(),
  client: OptStr,
  liveUrl: OptStr,
  cover: Media.optional(),
  /** Bildstrecke oben am Projekt (unter dem Titel). */
  gallery: z.array(Media).default([]),
  content: z.array(ImportProjectBlock).default([]),
});
const ImportPage = z.object({
  kind: z.literal('page'),
  ...Common,
  content: z.array(ImportPageBlock).default([]),
});

export const ImportFile = z.object({
  format: z.literal(IMPORT_FORMAT),
  version: z.literal(IMPORT_VERSION),
  items: z
    .array(z.discriminatedUnion('kind', [ImportProject, ImportPage]))
    .min(1)
    .max(50),
});
export type ImportFile = z.infer<typeof ImportFile>;

// ── Umwandlung ────────────────────────────────────────────────────────
export interface ImportMedia {
  id: string;
  filename: string;
}

export interface ImportPlanItem {
  /** Position in der Datei (ab 1), für Meldungen. */
  index: number;
  kind: 'project' | 'page';
  locale: Locale;
  group: string | undefined;
  title: string;
  slug: string;
  /** Fertiger Body für `POST /projects` bzw. `POST /pages` (ohne `translationGroupId`). */
  body: z.output<typeof CreateProjectBody> | z.output<typeof CreatePageBody>;
  /** Nicht fatal: z. B. ein Bild, das es in der Medienbibliothek nicht gibt (wird ausgelassen). */
  warnings: string[];
}

export interface ImportPlan {
  items: ImportPlanItem[];
  /** Fatale Probleme: Solange welche da sind, wird nichts importiert. */
  errors: string[];
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

const inline = (s: string) => parseInlineMarkup(s.trim());
/** Absätze durch Leerzeilen trennen; leere Teile entfallen. */
const paragraphs = (s: string) =>
  s
    .split(/\n[ \t]*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

/** Fließtext → Absätze und Listen (`- Punkt` bzw. `1. Punkt`, jeweils ein Block aus lauter Listenzeilen). */
export function textToNodes(text: string) {
  const bullet = /^\s*[-•]\s+/;
  const numbered = /^\s*\d+[.)]\s+/;
  return paragraphs(text).map((chunk) => {
    const lines = chunk.split('\n').filter((l) => l.trim() !== '');
    if (lines.every((l) => bullet.test(l)))
      return {
        kind: 'list' as const,
        ordered: false,
        items: lines.map((l) => inline(l.replace(bullet, ''))),
      };
    if (lines.every((l) => numbered.test(l)))
      return {
        kind: 'list' as const,
        ordered: true,
        items: lines.map((l) => inline(l.replace(numbered, ''))),
      };
    return { kind: 'paragraph' as const, runs: inline(chunk) };
  });
}

const where = (path: PropertyKey[]) =>
  path.reduce<string>(
    (acc, p) =>
      typeof p === 'number' ? `${acc}[${p + 1}]` : acc ? `${acc}.${String(p)}` : String(p),
    '',
  );
const issues = (prefix: string, e: z.ZodError) =>
  e.issues.map((i) => `${prefix}${i.path.length ? `.${where(i.path)}` : ''}: ${i.message}`);

/** Medien über den Dateinamen finden: exakt, ohne Groß-/Kleinschreibung, zuletzt ohne Endung (nur wenn eindeutig). */
export function createMediaResolver(media: readonly ImportMedia[]) {
  const norm = (s: string) => s.trim().toLowerCase();
  const bare = (s: string) => norm(s).replace(/\.[a-z0-9]{2,5}$/, '');
  return (name: string): string | undefined => {
    const n = norm(name);
    const exact = media.filter((m) => norm(m.filename) === n);
    if (exact.length >= 1) return exact[0]!.id;
    const loose = media.filter((m) => bare(m.filename) === bare(name));
    return loose.length === 1 ? loose[0]!.id : undefined;
  };
}

type Options = { media: readonly ImportMedia[]; makeId?: () => string };

/** Prüft eine Importdatei (bereits als JSON gelesen) und baut die Entwürfe. Wirft nie. */
export function buildImport(input: unknown, opts: Options): ImportPlan {
  const makeId = opts.makeId ?? (() => crypto.randomUUID());
  const resolve = createMediaResolver(opts.media);
  const parsed = ImportFile.safeParse(input);
  if (!parsed.success) return { items: [], errors: issues('Datei', parsed.error) };

  const errors: string[] = [];
  const items: ImportPlanItem[] = [];
  const seen = new Set<string>();

  parsed.data.items.forEach((it, idx) => {
    const index = idx + 1;
    const label = `Eintrag ${index} („${it.title}“)`;
    const warnings: string[] = [];
    const media = (name: string, what: string) => {
      const id = resolve(name);
      if (!id)
        warnings.push(`${what}: Medium „${name}“ nicht in der Medienbibliothek, ausgelassen.`);
      return id;
    };
    const slug = it.slug ? it.slug : slugify(it.title);
    const dup = `${it.kind}:${it.locale}:${slug}`;
    if (seen.has(dup))
      errors.push(`${label}: Slug „${slug}“ kommt in dieser Datei doppelt vor (${it.locale}).`);
    seen.add(dup);

    if (it.kind === 'project') {
      const content: unknown[] = [];
      it.content.forEach((b, bi) => {
        const at = `Block ${bi + 1} (${b.type})`;
        switch (b.type) {
          case 'chapter':
            content.push({
              id: makeId(),
              type: 'chapter',
              title: b.title,
              lead: inline(b.lead),
              body: b.body.flatMap(paragraphs).map(inline),
            });
            break;
          case 'quote':
            content.push({ id: makeId(), type: 'quote', lines: b.lines.map(inline) });
            break;
          case 'image': {
            const id = media(b.media, at);
            if (id)
              content.push({
                id: makeId(),
                type: 'image',
                mediaId: id,
                size: b.size,
                ...(b.caption ? { caption: b.caption } : {}),
              });
            break;
          }
          case 'gallery': {
            const found = b.items.flatMap((g) => {
              const id = media(g.media, at);
              return id ? [{ mediaId: id, ...(g.caption ? { caption: g.caption } : {}) }] : [];
            });
            if (found.length > 0)
              content.push({ id: makeId(), type: 'gallery', layout: b.layout, items: found });
            break;
          }
        }
      });
      const cover = it.cover ? media(it.cover, 'Titelbild') : undefined;
      const gallery = it.gallery.flatMap((g) => {
        const id = media(g, 'Bildstrecke oben');
        return id ? [{ mediaId: id }] : [];
      });
      const content2 = ProjectContent.safeParse(content);
      if (!content2.success) errors.push(...issues(`${label}: content`, content2.error));
      const body = CreateProjectBody.safeParse({
        locale: it.locale,
        slug,
        title: it.title,
        subtitle: it.subtitle ? inline(it.subtitle) : null,
        year: it.year,
        categories: it.categories,
        color: it.color ?? '#303030',
        client: it.client ?? null,
        liveUrl: it.liveUrl ?? null,
        coverMediaId: cover ?? null,
        content: content2.success ? content2.data : [],
        gallery,
        seoTitle: it.seoTitle ?? null,
        seoDescription: it.seoDescription ?? null,
      });
      if (!body.success) errors.push(...issues(label, body.error));
      else
        items.push({
          index,
          kind: 'project',
          locale: it.locale,
          group: it.group,
          title: it.title,
          slug,
          body: body.data,
          warnings,
        });
      return;
    }

    const content: unknown[] = [];
    it.content.forEach((b, bi) => {
      const at = `Block ${bi + 1} (${b.type})`;
      switch (b.type) {
        case 'page_title':
          content.push({
            id: makeId(),
            type: 'page_title',
            title: b.title,
            showCount: false,
            ...(b.intro ? { intro: b.intro } : {}),
          });
          break;
        case 'heading':
          content.push({ id: makeId(), type: 'heading', level: b.level, text: b.text });
          break;
        case 'text':
          content.push({ id: makeId(), type: 'richtext', nodes: textToNodes(b.text) });
          break;
        case 'image': {
          const id = media(b.media, at);
          if (id)
            content.push({
              id: makeId(),
              type: 'image',
              mediaId: id,
              size: b.size,
              ...(b.caption ? { caption: b.caption } : {}),
            });
          break;
        }
      }
    });
    const content2 = ContentPageContent.safeParse(content);
    if (!content2.success) errors.push(...issues(`${label}: content`, content2.error));
    const body = CreatePageBody.safeParse({
      locale: it.locale,
      slug,
      title: it.title,
      content: content2.success ? content2.data : [],
      seoTitle: it.seoTitle ?? null,
      seoDescription: it.seoDescription ?? null,
    });
    if (!body.success) errors.push(...issues(label, body.error));
    else
      items.push({
        index,
        kind: 'page',
        locale: it.locale,
        group: it.group,
        title: it.title,
        slug,
        body: body.data,
        warnings,
      });
  });

  // Sprachversionen: je Gruppe höchstens ein Eintrag pro Sprache und Art
  const groups = new Map<string, ImportPlanItem[]>();
  for (const i of items) if (i.group) groups.set(i.group, [...(groups.get(i.group) ?? []), i]);
  for (const [g, list] of groups) {
    const keys = list.map((i) => `${i.kind}:${i.locale}`);
    if (new Set(keys).size !== keys.length)
      errors.push(`Gruppe „${g}“: je Sprache darf nur ein Eintrag dieselbe Gruppe haben.`);
    if (new Set(list.map((i) => i.kind)).size > 1)
      errors.push(`Gruppe „${g}“: Projekte und Seiten lassen sich nicht verknüpfen.`);
  }
  return { items, errors };
}
