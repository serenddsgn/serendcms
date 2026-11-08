import type { FeaturedSize, Locale } from '@serend/schema';
import { projectIndexPath, splitParagraphs } from '@serend/schema';
import type { z } from 'zod';
import type {
  ChapterBlock,
  ContactCtaBlock,
  FeaturedProjectsBlock,
  HeroBlock,
  MediaTextCardBlock,
  PageTitleBlock,
  ProjectIndexBlock,
  QuoteBlock,
  ServicesOverviewBlock,
  HeadingBlock,
  ImageBlock,
  RichTextBlock,
} from '@serend/schema';
import {
  altOf,
  categoryName,
  featuredFor,
  projectUrl,
  projectsFor,
  resolveTarget,
  servicesFor,
  setting,
} from '../lib/data';
import { t } from '../i18n';
import { ArrowIcon, BigLink, Picture, Runs } from './Common';

type B<T extends z.ZodType> = z.infer<T>;
const idAttr = (b: { anchor?: string | undefined }) => b.anchor;

export function Hero({ b }: { b: B<typeof HeroBlock> }) {
  const delays = ['.75s', '.85s', '.95s', '1.05s'];
  // Zeichenzahl der längsten Zeile: daraus leitet das CSS die Schriftgröße ab, damit keine Zeile in der Mitte umbricht
  const longest = Math.max(
    ...b.headline.map((line) => line.reduce((n, r) => n + r.text.length, 0)),
  );
  return (
    <section class="section side" style="padding-top:120px;padding-bottom:96px" id={idAttr(b)}>
      <p class="eyebrow fade" style="margin:18px 0 0;animation-delay:.9s">
        {b.eyebrow}
      </p>
      <div>
        <h1
          class="display hero-h1"
          style={`margin:0;line-height:.98;letter-spacing:-.055em;--hl:${longest}`}
        >
          {b.headline.map((line, i) => (
            <>
              {i > 0 && ' '}
              <span class="mask">
                <span style={`animation-delay:${delays[i] ?? '1.1s'}`}>
                  <Runs runs={line} />
                </span>
              </span>
            </>
          ))}
        </h1>
        <div class="hero-grid" style="margin-top:56px">
          <div />
          <div class="fade" style="animation-delay:1.25s">
            <p style="margin:0;font-size:18px;line-height:1.6;color:var(--mute);max-width:520px">
              {b.intro}
            </p>
            <BigLink
              href={resolveTarget(b.link.target)}
              label={b.link.label}
              style="margin-top:28px;font-size:15px"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Standard-Größen im Automodus: erste Kachel groß, zweite hoch, der Rest klein. */
const AUTO_SIZE: FeaturedSize[] = ['l', 't'];
const TILE_SIZES: Record<Exclude<FeaturedSize, 'auto'>, string> = {
  l: '(max-width: 820px) 100vw, 66vw',
  w: '(max-width: 820px) 100vw, 66vw',
  t: '(max-width: 820px) 100vw, 34vw',
  s: '(max-width: 820px) 100vw, 34vw',
};

export function FeaturedProjects({
  b,
  locale,
}: {
  b: B<typeof FeaturedProjectsBlock>;
  locale: Locale;
}) {
  const ui = t(locale);
  const items = featuredFor(locale);
  return (
    <section class="section" aria-label={b.label} style="padding-bottom:40px" id={idAttr(b)}>
      <div class="bento">
        {items.map((p, i) => {
          const size = (p.featuredSize === 'auto' ? AUTO_SIZE[i] : p.featuredSize) ?? 's';
          return (
            <a
              class={`tile reveal sz-${size}`}
              href={projectUrl(p)}
              style={`--tc:${p.revision.tileColor ?? p.revision.color}`}
            >
              <Picture
                mediaId={p.revision.coverMediaId!}
                alt={altOf(p.revision.coverMediaId!, locale)}
                sizes={TILE_SIZES[size as Exclude<FeaturedSize, 'auto'>]}
                eager={i === 0}
              />
              <span class="look">{ui.view}</span>
              <span class="cap">
                <span style={`font-size:${size === 's' ? 20 : 22}px;font-weight:600`}>
                  {p.revision.title}
                </span>
                <span class="eyebrow" style="color:rgba(255,255,255,.8)">
                  {categoryName(locale, p.revision.categories[0]!)}
                </span>
              </span>
            </a>
          );
        })}
      </div>
      <div style="display:flex;justify-content:flex-end;padding-top:40px">
        <BigLink
          class="display"
          href={resolveTarget(b.allProjectsLink.target)}
          label={b.allProjectsLink.label}
          style="font-size:32px;font-weight:700"
        />
      </div>
    </section>
  );
}

export function ServicesOverview({
  b,
  locale,
}: {
  b: B<typeof ServicesOverviewBlock>;
  locale: Locale;
}) {
  const link = projectIndexPath(locale);
  return (
    <section class="section side" id={idAttr(b)} style="padding-top:140px;padding-bottom:60px">
      <p class="eyebrow" style="margin:14px 0 0">
        {b.eyebrow}
      </p>
      <div>
        <h2
          class="display reveal"
          style="margin:0 0 64px;font-size:clamp(36px,4.6vw,64px);line-height:1.02;max-width:900px"
        >
          <Runs runs={b.title} />
        </h2>
        <div style="border-bottom:1px solid var(--line)">
          {servicesFor(locale).map((s, i) => (
            <a class="svc reveal" href={`${link}?bereich=${s.key}`}>
              <span class="eyebrow">{String(i + 1).padStart(2, '0')}</span>
              <span class="svc-t display">{s.name}</span>
              <span class="svc-d" style="color:var(--mute);line-height:1.6">
                {s.description}
              </span>
              <span class="arr">
                <ArrowIcon size={22} />
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

export function MediaTextCard({ b, locale }: { b: B<typeof MediaTextCardBlock>; locale: Locale }) {
  return (
    <section class="section" id={idAttr(b)} style="padding-top:100px;padding-bottom:100px">
      <div class="card-section reveal split">
        <figure class="portrait">
          <Picture
            mediaId={b.mediaId}
            alt={altOf(b.mediaId, locale)}
            sizes="(max-width: 900px) 100vw, 700px"
            focal
          />
          {b.badge && (
            <figcaption class="badge">
              <span class="dot" />
              {b.badge}
            </figcaption>
          )}
        </figure>
        <div>
          <p class="eyebrow" style="margin:0 0 20px">
            {b.eyebrow}
          </p>
          <h2
            class="display"
            style="margin:0 0 24px;font-size:clamp(30px,3vw,44px);line-height:1.05"
          >
            <Runs runs={b.heading} />
          </h2>
          <p style="margin:0;font-size:19px;line-height:1.6;color:var(--mute)">{b.text}</p>
          {b.link && (
            <BigLink
              href={resolveTarget(b.link.target)}
              label={b.link.label}
              size={48}
              style="margin-top:32px;font-size:15px"
            />
          )}
        </div>
      </div>
    </section>
  );
}

export function ContactCta({ b, locale }: { b: B<typeof ContactCtaBlock>; locale: Locale }) {
  const { email } = setting(locale, 'site.identity');
  return (
    <section class="section" id={idAttr(b)} style="padding-top:120px;padding-bottom:80px">
      <p class="eyebrow" style="margin:0 0 28px">
        {b.eyebrow}
      </p>
      <h2
        class="display reveal"
        style="margin:0;font-size:clamp(56px,9vw,150px);line-height:.92;letter-spacing:-.055em"
      >
        {b.line1}
        <br />
        <span style="color:var(--mute);font-style:italic">{b.line2}</span>
      </h2>
      <a
        class="display liquid reveal"
        href={`mailto:${email}`}
        style="display:inline-block;margin-top:40px;font-size:clamp(30px,4.4vw,64px);font-weight:700"
      >
        {email}
      </a>
    </section>
  );
}

export function PageTitle({
  b,
  locale,
  count,
}: {
  b: B<typeof PageTitleBlock>;
  locale: Locale;
  count?: number;
}) {
  void locale;
  return (
    <section
      class="section"
      style="padding-top:104px;padding-bottom:56px;display:flex;justify-content:space-between;align-items:end;gap:32px;flex-wrap:wrap"
    >
      <h1
        class="display"
        style="margin:0;font-size:clamp(72px,12vw,184px);line-height:.86;letter-spacing:-.055em"
      >
        <span class="w">
          <span>{b.title}</span>
        </span>
        {b.showCount && count !== undefined && (
          <sup
            class="mono fade"
            style="font-size:16px;vertical-align:top;margin-left:12px;color:var(--mute);animation-delay:1s"
          >
            ({count})
          </sup>
        )}
      </h1>
      {b.intro && (
        <p
          class="fade"
          style="margin:0;max-width:380px;font-size:17px;line-height:1.6;color:var(--mute);animation-delay:1.05s"
        >
          {b.intro}
        </p>
      )}
    </section>
  );
}

/** Projektübersicht: alle Projekte serverseitig gerendert (Raster und Liste); Filter und Ansicht ergänzt ein kleines Script. */
export function ProjectIndex({ b, locale }: { b: B<typeof ProjectIndexBlock>; locale: Locale }) {
  const ui = t(locale);
  const list = projectsFor(locale);
  const ratios = ['4 / 5', '1 / 1', '4 / 5'];
  const offsets = ['0px', '64px', '24px'];
  const tabs = [
    { key: 'all', label: ui.all, n: list.length },
    ...servicesFor(locale).map((s) => ({
      key: s.key,
      label: s.name,
      n: list.filter((p) => p.revision.categories.includes(s.key)).length,
    })),
  ];
  const cats = (p: (typeof list)[number]) =>
    p.revision.categories.map((c) => categoryName(locale, c)).join(' · ');
  return (
    <div data-project-index data-default-view={b.defaultView} data-total={list.length}>
      <div class="section" style="padding:0">
        <div class="bar fade" style="animation-delay:1.15s" id="filter">
          <div role="group" aria-label={ui.filterLabel} style="display:flex;flex-wrap:wrap">
            {tabs.map((tb, i) => (
              <button
                type="button"
                class="tab"
                data-filter={tb.key}
                aria-pressed={i === 0 ? 'true' : 'false'}
              >
                {tb.label}
                <sup>{tb.n}</sup>
              </button>
            ))}
          </div>
          <div style="display:flex;align-items:center;gap:16px">
            <span class="mono" aria-live="polite" data-count style="color:var(--mute)">
              {list.length} / {list.length}
            </span>
            <div class="seg" role="group" aria-label={ui.viewLabel} data-view={b.defaultView}>
              <span class="thumb" />
              <button
                type="button"
                data-view-btn="grid"
                aria-pressed={b.defaultView === 'grid' ? 'true' : 'false'}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  aria-hidden="true"
                >
                  <rect x="3" y="3" width="7" height="7" rx="1.5" />
                  <rect x="14" y="3" width="7" height="7" rx="1.5" />
                  <rect x="3" y="14" width="7" height="7" rx="1.5" />
                  <rect x="14" y="14" width="7" height="7" rx="1.5" />
                </svg>
                {ui.grid}
              </button>
              <button
                type="button"
                data-view-btn="list"
                aria-pressed={b.defaultView === 'list' ? 'true' : 'false'}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  aria-hidden="true"
                >
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                {ui.list}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="pgrid" data-view="grid" hidden={b.defaultView !== 'grid'}>
        {list.map((p, i) => (
          <a
            class="g"
            data-cats={p.revision.categories.join(' ')}
            href={projectUrl(p)}
            style={`--tc:${p.revision.color};animation-delay:${(i * 0.05).toFixed(2)}s;margin-top:${offsets[i % 3]}`}
          >
            <span class="ph" style={`aspect-ratio:${ratios[i % 3]}`}>
              <Picture
                mediaId={p.revision.coverMediaId!}
                alt={altOf(p.revision.coverMediaId!, locale)}
                sizes="(max-width: 560px) 100vw, (max-width: 900px) 50vw, 33vw"
                eager={i < 3}
              />
              <span class="tag mono">{cats(p)}</span>
            </span>
            <span class="t">
              <b>{p.revision.title}</b>
              <span class="mono" style="color:var(--mute)">
                {p.revision.year}
              </span>
            </span>
          </a>
        ))}
      </div>
      <div class="plist section" data-view="list" hidden={b.defaultView !== 'list'}>
        <div class="lr head">
          <span class="mono" style="color:var(--mute)">
            {ui.colNr}
          </span>
          <span class="mono" style="color:var(--mute)">
            {ui.colClient}
          </span>
          <span class="mono hm" style="color:var(--mute)">
            {ui.colArea}
          </span>
          <span class="mono hm" style="color:var(--mute)">
            {ui.colYear}
          </span>
          <span />
        </div>
        {list.map((p, i) => (
          <a
            class="lr"
            data-cats={p.revision.categories.join(' ')}
            href={projectUrl(p)}
            style={`--tc:${p.revision.color};animation-delay:${(i * 0.05).toFixed(2)}s`}
          >
            <span class="mono nr" style="color:var(--mute)">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span class="nm">
              <span class="sw" />
              {p.revision.title}
            </span>
            <span class="hm" style="color:var(--mute)">
              {cats(p)}
            </span>
            <span class="mono hm" style="color:var(--mute)">
              {p.revision.year}
            </span>
            <ArrowIcon size={20} />
            <span class="peek">
              <Picture mediaId={p.revision.coverMediaId!} alt="" sizes="200px" />
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

// ── Projektdetail ─────────────────────────────────────────────────────
export function Chapter({ b, no }: { b: B<typeof ChapterBlock>; no: number }) {
  return (
    <article id={b.anchor ?? `kapitel-${no}`} class="ch reveal">
      <p class="label">
        {String(no).padStart(2, '0')} · {b.title}
      </p>
      <p class="lead">
        <Runs runs={b.lead} />
      </p>
      {b.body.map((p) => (
        <p>
          <Runs runs={p} />
        </p>
      ))}
    </article>
  );
}

export function Quote({ b }: { b: B<typeof QuoteBlock> }) {
  return (
    <section class="section reveal" style="padding-bottom:128px">
      <blockquote style="margin:0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:64px 0">
        <p
          class="display"
          style="margin:0;font-size:clamp(36px,5.4vw,80px);line-height:1;letter-spacing:-.05em"
        >
          {b.lines.map((line, i) => (
            <>
              {i > 0 && <br />}
              {i === b.lines.length - 1 && b.lines.length > 1 && !line.some((r) => r.liquid) ? (
                <span class="liquid">
                  <Runs runs={line} />
                </span>
              ) : (
                <Runs runs={line} />
              )}
            </>
          ))}
        </p>
      </blockquote>
    </section>
  );
}

export function Heading({ b }: { b: B<typeof HeadingBlock> }) {
  const Tag = b.level === 2 ? 'h2' : 'h3';
  return (
    <Tag
      class="display"
      id={b.anchor}
      style={`margin:48px 0 16px;font-size:${b.level === 2 ? 36 : 26}px;line-height:1.1`}
    >
      {b.text}
    </Tag>
  );
}

const IMAGE_SIZES_ATTR: Record<string, string> = {
  small: '(max-width: 900px) 60vw, 260px',
  medium: '(max-width: 900px) 100vw, 520px',
  large: '(max-width: 900px) 100vw, 760px',
  full: '(max-width: 1400px) 100vw, 1360px',
};

/** Bild auf einer Inhaltsseite. Größe als Anteil der Textspalte; „full“ steht außerhalb der Spalte (siehe PageBlocks). */
export function ImageFigure({ b, locale }: { b: B<typeof ImageBlock>; locale: Locale }) {
  return (
    <figure class={`pimg pimg-${b.size}`} id={b.anchor}>
      <Picture
        mediaId={b.mediaId}
        alt={altOf(b.mediaId, locale)}
        sizes={IMAGE_SIZES_ATTR[b.size] ?? IMAGE_SIZES_ATTR.medium!}
      />
      {b.caption && <figcaption>{b.caption}</figcaption>}
    </figure>
  );
}

export function RichText({ b }: { b: B<typeof RichTextBlock> }) {
  return (
    <div class="ch" style="padding-bottom:24px">
      {b.nodes.map((n) =>
        n.kind === 'paragraph' ? (
          // Leerzeilen im Textfeld des Admins werden eigene Absätze, einfache Zeilenumbrüche bleiben (pre-line)
          <>
            {splitParagraphs(n.runs).map((runs) => (
              <p style="white-space:pre-line">
                <Runs runs={runs} />
              </p>
            ))}
          </>
        ) : n.ordered ? (
          <ol style="font-size:19px;line-height:1.7;color:var(--body)">
            {n.items.map((it) => (
              <li>
                <Runs runs={it} />
              </li>
            ))}
          </ol>
        ) : (
          <ul style="font-size:19px;line-height:1.7;color:var(--body)">
            {n.items.map((it) => (
              <li>
                <Runs runs={it} />
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
