import type { Locale } from '@serend/schema';
import { projectIndexPath, type BuildProject } from '@serend/schema';
import { altOf, categoryName, data, projectUrl, projectsFor } from '../lib/data';
import { t } from '../i18n';
import { ArrowIcon, Picture, Runs } from './Common';

/** Teilt den Titel in zwei möglichst gleich lange Zeilen („Dolce &“ / „Falcone“). */
export function titleLines(title: string): string[] {
  const words = title.split(/\s+/);
  if (words.length < 2) return [title];
  let best = 1;
  let diff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const d = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
    if (d < diff) {
      diff = d;
      best = i;
    }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

const host = (url: string) => new URL(url).host.replace(/^www\./, '');

export function ProjectHero({ p, locale }: { p: BuildProject; locale: Locale }) {
  const ui = t(locale);
  const list = projectsFor(locale);
  const nr = list.findIndex((x) => x.id === p.id) + 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  const area = p.revision.categories.map((c) => categoryName(locale, c)).join(' · ');
  const lines = titleLines(p.revision.title);
  return (
    <section class="section side split" style="padding-top:96px;padding-bottom:64px;gap:32px">
      <p class="mono fade" style="margin:16px 0 0;color:var(--mute);animation-delay:.9s">
        {ui.caseLabel} {pad(nr)} / {pad(list.length)} · {area}
      </p>
      <div>
        <h1 class="display" style="margin:0;font-size:clamp(56px,9.6vw,152px);line-height:.88">
          {lines.map((l, i) => (
            <>
              {i > 0 && <br />}
              <span class="w">
                <span style={`animation-delay:${0.55 + i * 0.1}s`}>{l}</span>
              </span>
            </>
          ))}
        </h1>
        <div
          class="split"
          style="display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:48px;margin-top:48px;align-items:start"
        >
          {p.revision.subtitle ? (
            <p
              class="fade display"
              style="margin:0;font-size:clamp(26px,2.6vw,38px);line-height:1.15;font-weight:700;animation-delay:1s"
            >
              <Runs runs={p.revision.subtitle} />
            </p>
          ) : (
            <div />
          )}
          <dl class="meta fade" style="animation-delay:1.1s">
            {p.revision.client && (
              <div>
                <dt class="mono">{ui.client}</dt>
                <dd>{p.revision.client}</dd>
              </div>
            )}
            <div>
              <dt class="mono">{ui.area}</dt>
              <dd>{area}</dd>
            </div>
            <div>
              <dt class="mono">{ui.year}</dt>
              <dd>{p.revision.year}</dd>
            </div>
            <div style="border-bottom:1px solid var(--line)" hidden={!p.revision.liveUrl}>
              <dt class="mono">{ui.live}</dt>
              <dd>
                {p.revision.liveUrl && (
                  <a
                    href={p.revision.liveUrl}
                    rel="noopener"
                    target="_blank"
                    style="text-decoration:underline;text-underline-offset:4px"
                  >
                    {host(p.revision.liveUrl)} ↗
                  </a>
                )}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}

export function ImageStrip({ p, locale }: { p: BuildProject; locale: Locale }) {
  const ui = t(locale);
  const items = p.revision.gallery.length > 0 ? p.revision.gallery : [];
  if (items.length === 0) return null;
  return (
    <div
      class="strip fade"
      role="region"
      aria-label={ui.stripLabel}
      tabindex={0}
      style="animation-delay:1.2s"
    >
      {items.map((g, i) => (
        <figure>
          <Picture
            mediaId={g.mediaId}
            alt={altOf(g.mediaId, locale, g.altOverride)}
            sizes="(max-width: 900px) 90vw, 700px"
            eager={i === 0}
          />
        </figure>
      ))}
    </div>
  );
}

/** Bilderstrecke als Block im Projekt: `strip` = horizontaler Streifen, `grid` = zweispaltiges Raster. */
export function GalleryBlockView({
  b,
  locale,
}: {
  b: {
    id: string;
    anchor?: string;
    layout: 'strip' | 'grid';
    items: { mediaId: string; caption?: string }[];
  };
  locale: Locale;
}) {
  const ui = t(locale);
  if (b.items.length === 0) return null;
  if (b.layout === 'grid') {
    return (
      <section class="section" id={b.anchor} style="padding-bottom:96px">
        <div class="pgrid">
          {b.items.map((g) => (
            <figure>
              <Picture
                mediaId={g.mediaId}
                alt={altOf(g.mediaId, locale)}
                sizes="(max-width: 900px) 100vw, 680px"
              />
              {g.caption && <figcaption>{g.caption}</figcaption>}
            </figure>
          ))}
        </div>
      </section>
    );
  }
  return (
    <div
      class="strip"
      id={b.anchor}
      role="region"
      aria-label={ui.stripLabel}
      tabindex={0}
      style="margin-bottom:96px"
    >
      {b.items.map((g) => (
        <figure>
          <Picture
            mediaId={g.mediaId}
            alt={altOf(g.mediaId, locale)}
            sizes="(max-width: 900px) 90vw, 700px"
          />
        </figure>
      ))}
    </div>
  );
}

export interface ChapterEntry {
  n: string;
  label: string;
  href: string;
}

export function ChapterNav({ entries, label }: { entries: ChapterEntry[]; label: string }) {
  return (
    <nav
      class="chap hide-m"
      aria-label={label}
      style="position:sticky;top:120px;align-self:start"
      data-chapter-nav
    >
      <div style="position:relative">
        <span class="rail" aria-hidden="true">
          <i class="liquid-bg" />
        </span>
        {entries.map((e) => (
          <a href={e.href}>
            <span class="n">{e.n}</span>
            {e.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

/** Nächstes Projekt: das im Admin gewählte, sonst das folgende in der Reihenfolge der Übersicht. */
function nextProjectOf(p: BuildProject, locale: Locale): BuildProject | undefined {
  const list = projectsFor(locale);
  const explicit = p.revision.nextProjectId
    ? data().projectById.get(p.revision.nextProjectId)
    : undefined;
  const idx = list.findIndex((x) => x.id === p.id);
  const next = explicit ?? list[(idx + 1) % list.length];
  return !next || next.id === p.id ? undefined : next;
}

export interface Cta {
  label: string;
  href: string;
}

/** Mitlaufende Karte rechts neben dem Text: die Eckdaten bleiben im Blick, dazu der Weg zur Anfrage. */
export function ProjectAside({ p, locale, cta }: { p: BuildProject; locale: Locale; cta: Cta }) {
  const ui = t(locale);
  const area = p.revision.categories.map((c) => categoryName(locale, c)).join(' · ');
  return (
    <aside class="aside" aria-label={p.revision.title}>
      <div class="metacard">
        <dl>
          {p.revision.client && (
            <div>
              <dt class="mono">{ui.client}</dt>
              <dd>{p.revision.client}</dd>
            </div>
          )}
          <div>
            <dt class="mono">{ui.area}</dt>
            <dd>{area}</dd>
          </div>
          <div>
            <dt class="mono">{ui.year}</dt>
            <dd>{p.revision.year}</dd>
          </div>
          {p.revision.liveUrl && (
            <div>
              <dt class="mono">{ui.live}</dt>
              <dd>
                <a href={p.revision.liveUrl} rel="noopener" target="_blank">
                  {host(p.revision.liveUrl)} ↗
                </a>
              </dd>
            </div>
          )}
        </dl>
        <a
          class="mc-cta"
          href={cta.href}
          data-inquiry-open
          data-inquiry-ref={p.revision.title}
          aria-haspopup="dialog"
          aria-controls="inquiry"
        >
          {ui.follow.title}
          <ArrowIcon size={14} />
        </a>
      </div>
    </aside>
  );
}

/** Schmale Leiste unten: voriges und nächstes Projekt. Erscheint nach dem Hero (site.ts), ohne JS bleibt sie verborgen. */
export function ProjectDock({ p, locale }: { p: BuildProject; locale: Locale }) {
  const ui = t(locale);
  const list = projectsFor(locale);
  const next = nextProjectOf(p, locale);
  if (list.length < 2 || !next) return null;
  const idx = list.findIndex((x) => x.id === p.id);
  const prev = list[(idx - 1 + list.length) % list.length]!;
  const item = (target: BuildProject, dir: 'prev' | 'next') => (
    <a class={`dk dk-${dir}`} href={projectUrl(target)} rel={dir}>
      <span class="dk-img">
        <Picture mediaId={target.revision.coverMediaId!} alt="" sizes="48px" />
      </span>
      <span class="dk-t">
        <span class="mono">{dir === 'prev' ? `← ${ui.prev}` : `${ui.next} →`}</span>
        <b>{target.revision.title}</b>
      </span>
    </a>
  );
  return (
    <nav class="dock" aria-label={ui.dockLabel} data-dock>
      {item(prev, 'prev')}
      <a class="dk-all mono" href={projectIndexPath(locale)}>
        {ui.allProjects}
      </a>
      {item(next, 'next')}
    </nav>
  );
}

/** Abschluss einer Projektseite: Gesicht, Zusage zur Antwortzeit und Anfrage mit Bezug auf das Projekt. */
export function ProjectFollowUp({
  p,
  locale,
  cta,
  portraitId,
}: {
  p: BuildProject;
  locale: Locale;
  cta: Cta;
  portraitId?: string | undefined;
}) {
  const ui = t(locale);
  return (
    <section class="section follow reveal">
      <div class="fu">
        {portraitId && (
          <figure class="fu-p">
            <Picture mediaId={portraitId} alt={altOf(portraitId, locale)} sizes="160px" focal />
          </figure>
        )}
        <div class="fu-tx">
          <p class="eyebrow" style="margin:0 0 14px">
            {ui.follow.eyebrow}
          </p>
          <h2 class="display">{ui.follow.title}</h2>
          <p class="fu-p2">{ui.follow.text}</p>
          <div class="fu-row">
            <a
              class="cta"
              href={cta.href}
              data-inquiry-open
              data-inquiry-ref={p.revision.title}
              aria-haspopup="dialog"
              aria-controls="inquiry"
            >
              <span class="dot" />
              <span class="lbl">{cta.label}</span>
            </a>
            <span class="ref mono">
              {ui.follow.reference}: {p.revision.title}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function NextProject({ p, locale }: { p: BuildProject; locale: Locale }) {
  const ui = t(locale);
  const list = projectsFor(locale);
  const next = nextProjectOf(p, locale);
  if (!next) return null;
  const nr = list.findIndex((x) => x.id === next.id) + 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <a
      class="next panel"
      href={projectUrl(next)}
      style="border-left:0;border-right:0;border-bottom:0;border-radius:0"
    >
      <span class="nimg">
        <Picture mediaId={next.revision.coverMediaId!} alt="" sizes="300px" />
      </span>
      <span
        class="wrap"
        style="display:block;padding-top:112px;padding-bottom:112px;position:relative"
      >
        <span class="mono" style="display:block;color:#9b9b98;margin-bottom:20px">
          {ui.next} · {pad(nr)} / {pad(list.length)}
        </span>
        <span
          class="nt display"
          style="display:block;font-size:clamp(56px,9vw,140px);line-height:.9"
        >
          {next.revision.title} →
        </span>
      </span>
    </a>
  );
}
