import { z } from 'zod';
import { Slug, Uuid } from './common.js';

/** Version des Block-Schemas. Änderungen nur zusammen mit einer Migrationsfunktion (siehe unten). */
export const CONTENT_SCHEMA_VERSION = 1;

// ── gemeinsame Bausteine ──────────────────────────────────────────────
/** Inline-Lauf; `liquid` markiert Schlüsselwörter mit Liquid-Verlauf. */
export const Run = z.object({
  text: z.string().min(1).max(500),
  liquid: z.boolean().optional(),
  em: z.boolean().optional(),
  href: z
    .string()
    .max(500)
    .refine(
      (v) => v.startsWith('/') || /^https?:\/\//.test(v) || v.startsWith('mailto:'),
      'Ungültiger Link',
    )
    .optional(),
});
export const Inline = z.array(Run).min(1).max(20);
export type Inline = z.infer<typeof Inline>;

/** Link-Ziele per ID, damit Slug-Änderungen Links nicht brechen. */
export const LinkTarget = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('page'), pageId: Uuid, fragment: Slug.optional() }),
  z.object({ kind: z.literal('project'), projectId: Uuid }),
  z.object({ kind: z.literal('url'), url: z.url({ protocol: /^(https?|mailto|tel)$/ }) }),
]);
export const Link = z.object({ label: z.string().min(1).max(80), target: LinkTarget });
export type Link = z.infer<typeof Link>;

const Base = { id: Uuid, anchor: Slug.optional() };

// ── Startseite ────────────────────────────────────────────────────────
export const HeroBlock = z.object({
  ...Base,
  type: z.literal('hero'),
  eyebrow: z.string().max(80),
  headline: z.array(Inline).min(1).max(4),
  intro: z.string().max(600),
  link: Link,
});
export const FeaturedProjectsBlock = z.object({
  ...Base,
  type: z.literal('featured_projects'),
  label: z.string().max(80),
  allProjectsLink: Link,
  limit: z.number().int().min(1).max(5).default(5),
});
export const ServicesOverviewBlock = z.object({
  ...Base,
  type: z.literal('services_overview'),
  eyebrow: z.string().max(80),
  title: Inline,
});
export const MediaTextCardBlock = z.object({
  ...Base,
  type: z.literal('media_text_card'),
  mediaId: Uuid,
  badge: z.string().max(80).optional(),
  eyebrow: z.string().max(80),
  heading: Inline,
  text: z.string().max(1200),
  link: Link.optional(),
});
export const ContactCtaBlock = z.object({
  ...Base,
  type: z.literal('contact_cta'),
  eyebrow: z.string().max(80),
  line1: z.string().max(60),
  line2: z.string().max(60),
});

// ── Projektübersicht ──────────────────────────────────────────────────
export const PageTitleBlock = z.object({
  ...Base,
  type: z.literal('page_title'),
  title: z.string().max(80),
  showCount: z.boolean().default(false),
  intro: z.string().max(400).optional(),
});
export const ProjectIndexBlock = z.object({
  ...Base,
  type: z.literal('project_index'),
  defaultView: z.enum(['grid', 'list']).default('grid'),
});

// ── Projektdetail ─────────────────────────────────────────────────────
export const ChapterBlock = z.object({
  ...Base,
  type: z.literal('chapter'),
  title: z.string().min(1).max(60),
  lead: Inline,
  body: z.array(Inline).max(12),
});
export const QuoteBlock = z.object({
  ...Base,
  type: z.literal('quote'),
  lines: z.array(Inline).min(1).max(3),
});
export const PickAndMixDemo = z
  .object({
    component: z.literal('pick-and-mix'),
    eyebrow: z.string().max(120),
    title: z.string().max(120),
    sizes: z.array(z.number().int().min(1).max(200)).min(1).max(8),
    defaultSize: z.number().int(),
    flavors: z
      .array(
        z.object({
          key: Slug,
          name: z.string().min(1).max(60),
          priceCents: z.number().int().min(0).max(100_000),
          color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        }),
      )
      .min(2)
      .max(8),
    initial: z.record(Slug, z.number().int().min(0)).optional(),
  })
  .refine((v) => v.sizes.includes(v.defaultSize), {
    message: 'defaultSize muss in sizes enthalten sein',
  });
export const InteractiveDemoBlock = z.object({
  ...Base,
  type: z.literal('interactive_demo'),
  navLabel: z.string().min(1).max(40),
  demo: z.discriminatedUnion('component', [PickAndMixDemo]),
});

// ── Inhaltsseiten ─────────────────────────────────────────────────────
export const HeadingBlock = z.object({
  ...Base,
  type: z.literal('heading'),
  level: z.union([z.literal(2), z.literal(3)]),
  text: z.string().min(1).max(120),
});
export const RichTextBlock = z.object({
  ...Base,
  type: z.literal('richtext'),
  nodes: z
    .array(
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('paragraph'), runs: Inline }),
        z.object({
          kind: z.literal('list'),
          ordered: z.boolean(),
          items: z.array(Inline).min(1).max(30),
        }),
      ]),
    )
    .min(1)
    .max(60),
});

// ── erlaubte Blöcke je Inhaltstyp ─────────────────────────────────────
const unique = (blocks: { id: string }[]) =>
  new Set(blocks.map((b) => b.id)).size === blocks.length;
const uniqueIds = { message: 'Block-IDs müssen eindeutig sein' };

export const ProjectContent = z
  .array(z.discriminatedUnion('type', [ChapterBlock, QuoteBlock, InteractiveDemoBlock]))
  .max(60)
  .refine(unique, uniqueIds);
export type ProjectContent = z.infer<typeof ProjectContent>;

export const ContentPageContent = z
  .array(z.discriminatedUnion('type', [PageTitleBlock, HeadingBlock, RichTextBlock]))
  .max(80)
  .refine(unique, uniqueIds);

/** Systemseiten haben feste Struktur: je Typ genau einmal, in dieser Reihenfolge. */
export const HomeContent = z.tuple([
  HeroBlock,
  FeaturedProjectsBlock,
  ServicesOverviewBlock,
  MediaTextCardBlock,
  ContactCtaBlock,
]);
export const ProjectsPageContent = z.tuple([PageTitleBlock, ProjectIndexBlock]);

export const PAGE_SYSTEM_KEYS = ['home', 'projects'] as const;
export const PageSystemKey = z.enum(PAGE_SYSTEM_KEYS);
export type PageSystemKey = z.infer<typeof PageSystemKey>;

/** Welches Content-Schema gilt für eine Seite? */
export function pageContentSchema(systemKey: PageSystemKey | null) {
  if (systemKey === 'home') return HomeContent;
  if (systemKey === 'projects') return ProjectsPageContent;
  return ContentPageContent;
}

// ── Medienreferenzen aus Blöcken ──────────────────────────────────────
/** Alle `mediaId`-Verweise der Blöcke (für die abgeleitete Referenztabelle). */
export function collectMediaIds(content: readonly unknown[]): string[] {
  const ids = new Set<string>();
  for (const block of content) {
    if (typeof block === 'object' && block !== null && 'mediaId' in block) {
      const id = (block as { mediaId: unknown }).mediaId;
      if (typeof id === 'string') ids.add(id);
    }
  }
  return [...ids];
}

/** Alle Link-Ziele (page/project) aus Blöcken, für die Referenzprüfung beim Speichern. */
export function collectLinkTargets(content: readonly unknown[]): {
  pageIds: string[];
  projectIds: string[];
} {
  const pageIds = new Set<string>();
  const projectIds = new Set<string>();
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) return void v.forEach(visit);
    if (typeof v !== 'object' || v === null) return;
    const o = v as Record<string, unknown>;
    if (typeof o.kind === 'string' && o.kind === 'page' && typeof o.pageId === 'string')
      pageIds.add(o.pageId);
    if (typeof o.kind === 'string' && o.kind === 'project' && typeof o.projectId === 'string')
      projectIds.add(o.projectId);
    Object.values(o).forEach(visit);
  };
  visit(content);
  return { pageIds: [...pageIds], projectIds: [...projectIds] };
}

// ── Schema-Migrationen ────────────────────────────────────────────────
/**
 * Jede Schemaänderung bekommt hier eine Funktion `vN → vN+1`. Ein Skript schreibt
 * bestehende Revisionen damit um; beim Lesen dient `upgradeContent` als Sicherheitsnetz.
 */
export const contentMigrations: Record<number, (content: unknown[]) => unknown[]> = {};

export function upgradeContent(content: unknown[], fromVersion: number): unknown[] {
  if (fromVersion > CONTENT_SCHEMA_VERSION || fromVersion < 1) {
    throw new Error(`Unbekannte Content-Schema-Version ${fromVersion}`);
  }
  let current = content;
  for (let v = fromVersion; v < CONTENT_SCHEMA_VERSION; v++) {
    const migrate = contentMigrations[v];
    if (!migrate) throw new Error(`Migrationsfunktion v${v} → v${v + 1} fehlt`);
    current = migrate(current);
  }
  return current;
}
