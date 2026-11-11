import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Inline } from '@serend/schema';
import { api } from '../api';
import { Field } from '../ui';
import { InlineField } from './InlineField';
import { MediaField, MediaThumb } from './MediaPicker';
import { Sortable } from './Sortable';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Block = { id: string; type: string; anchor?: string } & Record<string, any>;

const uid = () => crypto.randomUUID();
const run = (text: string) => [{ text }];

export const BLOCK_LABELS: Record<string, string> = {
  hero: 'Hero',
  featured_projects: 'Ausgewählte Arbeiten',
  services_overview: 'Leistungen',
  media_text_card: 'Bild mit Text',
  contact_cta: 'Kontakt',
  page_title: 'Seitentitel',
  project_index: 'Projektliste',
  chapter: 'Kapitel',
  quote: 'Zitat',
  interactive_demo: 'Interaktive Demo',
  heading: 'Überschrift',
  richtext: 'Text',
  process: 'Ablauf',
  image: 'Bild',
  gallery: 'Bilderstrecke',
};

/**
 * Verfügbare interaktive Demos. Eine neue Demo braucht: Schema (`packages/schema/src/blocks.ts`), einen Eintrag hier
 * (Menü + Startwerte), ein Formular (Fallunterscheidung im Block `interactive_demo` von `BlockForm`) und die Insel in `apps/web/src/components/DemoSection.astro`.
 */
export const DEMO_TYPES: {
  component: string;
  label: string;
  description: string;
  create: () => { navLabel: string; demo: Record<string, any> };
}[] = [
  {
    component: 'pick-and-mix',
    label: 'Pick & Mix',
    description: 'Box aus Sorten zusammenstellen (Dolce & Falcone)',
    create: () => ({
      navLabel: 'Ausprobieren',
      demo: {
        component: 'pick-and-mix',
        eyebrow: 'Ausprobieren',
        title: 'Stellen Sie Ihre Box zusammen.',
        sizes: [12, 18, 24],
        defaultSize: 12,
        flavors: [
          { key: 'sorte-a', name: 'Sorte A', priceCents: 160, color: '#e0a98f' },
          { key: 'sorte-b', name: 'Sorte B', priceCents: 200, color: '#b06bb4' },
        ],
      },
    }),
  },
];

export function newDemoBlock(component: string): Block {
  const t = DEMO_TYPES.find((d) => d.component === component) ?? DEMO_TYPES[0]!;
  return { id: uid(), type: 'interactive_demo', ...t.create() };
}

export function newBlock(type: string): Block {
  const id = uid();
  switch (type) {
    case 'chapter':
      return { id, type, title: 'Neues Kapitel', lead: run('Einleitung'), body: [] };
    case 'quote':
      return { id, type, lines: [run('Erste Zeile'), [{ text: 'Zweite Zeile', liquid: true }]] };
    case 'interactive_demo':
      return newDemoBlock(DEMO_TYPES[0]!.component);
    case 'gallery':
      return { id, type, layout: 'strip', items: [] };
    case 'heading':
      return { id, type, level: 2, text: 'Überschrift' };
    case 'richtext':
      return { id, type, nodes: [{ kind: 'paragraph', runs: run('Text') }] };
    case 'process':
      return {
        id,
        type,
        eyebrow: 'So arbeiten wir',
        steps: [
          { title: 'Verstehen', text: '' },
          { title: 'Bauen', text: '' },
        ],
      };
    case 'page_title':
      return { id, type, title: 'Titel', showCount: false };
    case 'image':
      return { id, type, mediaId: '', size: 'medium' };
    default:
      return { id, type };
  }
}

/** Sprache der bearbeiteten Seite: Links dürfen nur auf Seiten derselben Sprache zeigen. */
const LocaleContext = createContext<string | undefined>(undefined);

interface Props {
  /** Sprache des Inhalts (für die Seitenauswahl in Links). */
  locale?: string;
  blocks: Block[];
  onChange: (b: Block[]) => void;
  /** Blocktypen, die hinzugefügt werden dürfen. Leer = feste Struktur (Systemseite): nur Felder bearbeiten. */
  allowed: string[];
}

export function BlockEditor({ locale, blocks, onChange, allowed }: Props) {
  const fixed = allowed.length === 0;
  const set = (i: number, b: Block) => onChange(blocks.map((x, j) => (j === i ? b : x)));
  const row = (b: Block, i: number, handle: React.ReactNode) => (
    <div className="sortable">
      <div className="row between">
        <div className="row">
          {!fixed && handle}
          <strong>{BLOCK_LABELS[b.type] ?? b.type}</strong>
        </div>
        {!fixed && (
          <button
            type="button"
            className="btn small danger"
            onClick={() => onChange(blocks.filter((_, j) => j !== i))}
          >
            Entfernen
          </button>
        )}
      </div>
      <BlockForm block={b} onChange={(nb) => set(i, nb)} />
    </div>
  );
  return (
    <LocaleContext.Provider value={locale}>
      {fixed ? (
        blocks.map((b, i) => <div key={b.id}>{row(b, i, null)}</div>)
      ) : (
        <Sortable items={blocks} getId={(b) => b.id} onReorder={onChange} render={row} />
      )}
      {!fixed && (
        <div className="row" style={{ marginTop: 8 }}>
          {allowed.map((t) =>
            t === 'interactive_demo' ? (
              <DemoMenu key={t} onPick={(c) => onChange([...blocks, newDemoBlock(c)])} />
            ) : (
              <button
                key={t}
                type="button"
                className="btn small"
                onClick={() => onChange([...blocks, newBlock(t)])}
              >
                + {BLOCK_LABELS[t] ?? t}
              </button>
            ),
          )}
        </div>
      )}
    </LocaleContext.Provider>
  );
}

/** „+ Interaktive Demo“: Auswahl, welche Demo eingefügt wird. */
function DemoMenu({ onPick }: { onPick: (component: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn small"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        + Interaktive Demo ▾
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            zIndex: 10,
            minWidth: 280,
            background: 'var(--card)',
            border: '1px solid var(--line)',
            borderRadius: 12,
            padding: 4,
            boxShadow: '0 8px 24px rgba(0,0,0,.2)',
          }}
        >
          {DEMO_TYPES.map((d) => (
            <button
              key={d.component}
              type="button"
              role="menuitem"
              className="btn"
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                border: 0,
                borderRadius: 8,
                background: 'transparent',
              }}
              onClick={() => {
                setOpen(false);
                onPick(d.component);
              }}
            >
              <strong>{d.label}</strong>
              <br />
              <span className="small muted">{d.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const Text = ({
  label,
  value,
  onChange,
  area = false,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  area?: boolean;
}) => (
  <Field label={label}>
    {area ? (
      <textarea value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    ) : (
      <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    )}
  </Field>
);

/** Projekt, das im Hero der Startseite beworben wird. Leer = automatisch das neueste. */
function HeroProjectField({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  const locale = useContext(LocaleContext) ?? 'de';
  const projects = useQuery({
    queryKey: ['projects', locale],
    queryFn: () =>
      api.get<{ projects: { id: string; title: string; year: number; status: string }[] }>(
        `/projects?locale=${locale}`,
      ),
  });
  const list = projects.data?.projects.filter((p) => p.status === 'published') ?? [];
  return (
    <Field label="Projekt im Hero">
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">Automatisch: das neueste Projekt</option>
        {value && projects.data && !list.some((p) => p.id === value) && (
          <option value={value}>(Projekt dieser Sprache nicht in der Liste)</option>
        )}
        {list.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title} ({p.year})
          </option>
        ))}
      </select>
    </Field>
  );
}

/** Link mit festem Ziel: Seite (Auswahl), Projekt (ID) oder URL. */
function LinkForm({
  label,
  value,
  onChange,
}: {
  label: string;
  value: any;
  onChange: (v: any) => void;
}) {
  const t = value?.target ?? { kind: 'url', url: '' };
  const locale = useContext(LocaleContext);
  const pages = useQuery({
    queryKey: ['pages', locale ?? 'all'],
    queryFn: () =>
      api.get<{ pages: { id: string; title: string; locale: string }[] }>(
        `/pages${locale ? `?locale=${locale}` : ''}`,
      ),
    enabled: t.kind === 'page',
  });
  return (
    <fieldset style={{ border: '1px solid var(--line)', borderRadius: 8, margin: '8px 0' }}>
      <legend className="small muted">{label}</legend>
      <div className="grid3">
        <Text
          label="Beschriftung"
          value={value?.label}
          onChange={(l) => onChange({ ...value, label: l })}
        />
        <Field label="Art">
          <select
            value={t.kind}
            onChange={(e) =>
              onChange({
                ...value,
                target:
                  e.target.value === 'url'
                    ? { kind: 'url', url: '' }
                    : e.target.value === 'page'
                      ? { kind: 'page', pageId: '' }
                      : { kind: 'project', projectId: '' },
              })
            }
          >
            <option value="url">URL</option>
            <option value="page">Seite</option>
            <option value="project">Projekt (ID)</option>
          </select>
        </Field>
        {t.kind === 'url' && (
          <Text
            label="URL"
            value={t.url}
            onChange={(u) => onChange({ ...value, target: { ...t, url: u } })}
          />
        )}
        {t.kind === 'page' && (
          <Field label="Seite">
            <select
              value={t.pageId}
              // Anker gehören zu einer Seite: beim Wechsel der Zielseite nicht mitnehmen
              onChange={(e) =>
                onChange({ ...value, target: { kind: 'page', pageId: e.target.value } })
              }
            >
              <option value="">– wählen –</option>
              {t.pageId && !pages.data?.pages.some((p) => p.id === t.pageId) && (
                <option value={t.pageId}>(unbekannte Seite)</option>
              )}
              {pages.data?.pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                  {locale ? '' : ` (${p.locale.toUpperCase()})`}
                </option>
              ))}
            </select>
          </Field>
        )}
        {t.kind === 'project' && (
          <Text
            label="Projekt-ID"
            value={t.projectId}
            onChange={(p) => onChange({ ...value, target: { ...t, projectId: p } })}
          />
        )}
      </div>
      {t.kind === 'page' && (
        <Text
          label="Anker (nur wenn die Zielseite einen Block mit diesem Anker hat, z. B. leistungen)"
          value={t.fragment ?? ''}
          onChange={(f) => onChange({ ...value, target: { ...t, fragment: f || undefined } })}
        />
      )}
    </fieldset>
  );
}

/** Formular der Demo „Pick & Mix“. */
function PickAndMixForm({ d, setD }: { d: any; setD: (patch: Record<string, unknown>) => void }) {
  return (
    <>
      <Text label="Eyebrow" value={d.eyebrow} onChange={(v) => setD({ eyebrow: v })} />
      <Text label="Titel" value={d.title} onChange={(v) => setD({ title: v })} />
      <div className="grid2">
        <Field label="Boxgrößen (Komma)">
          <input
            value={d.sizes.join(', ')}
            onChange={(e) =>
              setD({
                sizes: e.target.value
                  .split(',')
                  .map((x) => Number(x.trim()))
                  .filter(Boolean),
              })
            }
          />
        </Field>
        <Field label="Standardgröße">
          <input
            type="number"
            value={d.defaultSize}
            onChange={(e) => setD({ defaultSize: Number(e.target.value) })}
          />
        </Field>
      </div>
      <h3>Sorten</h3>
      {d.flavors.map((f: any, i: number) => (
        <div key={i} className="grid3" style={{ alignItems: 'end' }}>
          <Text
            label="Schlüssel"
            value={f.key}
            onChange={(v) =>
              setD({
                flavors: d.flavors.map((x: any, j: number) => (j === i ? { ...x, key: v } : x)),
              })
            }
          />
          <Text
            label="Name"
            value={f.name}
            onChange={(v) =>
              setD({
                flavors: d.flavors.map((x: any, j: number) => (j === i ? { ...x, name: v } : x)),
              })
            }
          />
          <Field label="Preis (Cent) / Farbe">
            <div className="row">
              <input
                type="number"
                value={f.priceCents}
                onChange={(e) =>
                  setD({
                    flavors: d.flavors.map((x: any, j: number) =>
                      j === i ? { ...x, priceCents: Number(e.target.value) } : x,
                    ),
                  })
                }
              />
              <input
                type="color"
                value={f.color}
                onChange={(e) =>
                  setD({
                    flavors: d.flavors.map((x: any, j: number) =>
                      j === i ? { ...x, color: e.target.value } : x,
                    ),
                  })
                }
                style={{ width: 50 }}
              />
            </div>
          </Field>
        </div>
      ))}
      <div className="row">
        <button
          type="button"
          className="btn small"
          onClick={() =>
            setD({
              flavors: [
                ...d.flavors,
                {
                  key: `sorte-${d.flavors.length + 1}`,
                  name: 'Neue Sorte',
                  priceCents: 200,
                  color: '#888888',
                },
              ],
            })
          }
        >
          + Sorte
        </button>
        {d.flavors.length > 2 && (
          <button
            type="button"
            className="btn small"
            onClick={() => setD({ flavors: d.flavors.slice(0, -1) })}
          >
            − Sorte
          </button>
        )}
      </div>
    </>
  );
}

function BlockForm({ block: b, onChange }: { block: Block; onChange: (b: Block) => void }) {
  const up = (patch: Record<string, unknown>) => onChange({ ...b, ...patch });
  switch (b.type) {
    case 'hero':
      return (
        <>
          <Text label="Eyebrow" value={b.eyebrow} onChange={(v) => up({ eyebrow: v })} />
          {(b.headline as Inline[]).map((l, i) => (
            <InlineField
              key={i}
              label={`Headline Zeile ${i + 1}`}
              value={l}
              onChange={(v) =>
                up({ headline: b.headline.map((x: Inline, j: number) => (j === i ? v : x)) })
              }
            />
          ))}
          <div className="row">
            <button
              type="button"
              className="btn small"
              onClick={() => up({ headline: [...b.headline, run('Neue Zeile')] })}
            >
              + Zeile
            </button>
            {b.headline.length > 1 && (
              <button
                type="button"
                className="btn small"
                onClick={() => up({ headline: b.headline.slice(0, -1) })}
              >
                − Zeile
              </button>
            )}
          </div>
          <Text
            label="Einleitung (**Wort** hebt Schlüsselbegriffe hervor)"
            value={b.intro}
            area
            onChange={(v) => up({ intro: v })}
          />
          <HeroProjectField value={b.projectId} onChange={(v) => up({ projectId: v })} />
          <LinkForm label="Link" value={b.link} onChange={(v) => up({ link: v })} />
        </>
      );
    case 'featured_projects':
      return (
        <>
          <Text label="Beschriftung" value={b.label} onChange={(v) => up({ label: v })} />
          <p className="small muted">
            Auswahl, Reihenfolge und Größen der Kacheln legst du im Menüpunkt „Startseiten-Layout“
            fest.
          </p>
          <LinkForm
            label="„Alle Projekte“-Link"
            value={b.allProjectsLink}
            onChange={(v) => up({ allProjectsLink: v })}
          />
        </>
      );
    case 'services_overview':
      return (
        <>
          <Text label="Eyebrow" value={b.eyebrow} onChange={(v) => up({ eyebrow: v })} />
          <InlineField label="Titel" value={b.title} onChange={(v) => up({ title: v })} />
        </>
      );
    case 'media_text_card':
      return (
        <>
          <MediaField label="Bild" value={b.mediaId} onChange={(v) => up({ mediaId: v ?? '' })} />
          <Text label="Badge" value={b.badge} onChange={(v) => up({ badge: v || undefined })} />
          <Text label="Eyebrow" value={b.eyebrow} onChange={(v) => up({ eyebrow: v })} />
          <InlineField label="Überschrift" value={b.heading} onChange={(v) => up({ heading: v })} />
          <Text label="Text" value={b.text} area onChange={(v) => up({ text: v })} />
          <LinkForm label="Link" value={b.link} onChange={(v) => up({ link: v })} />
        </>
      );
    case 'contact_cta':
      return (
        <>
          <Text label="Eyebrow" value={b.eyebrow} onChange={(v) => up({ eyebrow: v })} />
          <div className="grid2">
            <Text label="Zeile 1" value={b.line1} onChange={(v) => up({ line1: v })} />
            <Text label="Zeile 2 (kursiv)" value={b.line2} onChange={(v) => up({ line2: v })} />
          </div>
        </>
      );
    case 'page_title':
      return (
        <>
          <Text label="Titel" value={b.title} onChange={(v) => up({ title: v })} />
          <Text
            label="Einleitung"
            value={b.intro}
            area
            onChange={(v) => up({ intro: v || undefined })}
          />
          <label className="row">
            <input
              type="checkbox"
              checked={!!b.showCount}
              onChange={(e) => up({ showCount: e.target.checked })}
            />{' '}
            Anzahl anzeigen
          </label>
        </>
      );
    case 'project_index':
      return (
        <Field label="Standardansicht">
          <select value={b.defaultView} onChange={(e) => up({ defaultView: e.target.value })}>
            <option value="grid">Raster</option>
            <option value="list">Liste</option>
          </select>
        </Field>
      );
    case 'chapter':
      return (
        <>
          <Text
            label="Titel (Kapitel-Navigation)"
            value={b.title}
            onChange={(v) => up({ title: v })}
          />
          <InlineField label="Lead" value={b.lead} multiline onChange={(v) => up({ lead: v })} />
          {(b.body as Inline[]).map((p, i) => (
            <div key={i} className="row" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <InlineField
                  label={`Absatz ${i + 1}`}
                  value={p}
                  multiline
                  onChange={(v) =>
                    up({ body: b.body.map((x: Inline, j: number) => (j === i ? v : x)) })
                  }
                />
              </div>
              <button
                type="button"
                className="btn small"
                onClick={() => up({ body: b.body.filter((_: unknown, j: number) => j !== i) })}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn small"
            onClick={() => up({ body: [...b.body, run('Neuer Absatz')] })}
          >
            + Absatz
          </button>
        </>
      );
    case 'process': {
      const steps = b.steps as { title: string; text: string }[];
      const setStep = (i: number, patch: Partial<{ title: string; text: string }>) =>
        up({ steps: steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
      return (
        <>
          <Text label="Überschrift" value={b.eyebrow} onChange={(v) => up({ eyebrow: v })} />
          {steps.map((s, i) => (
            <div key={i} className="row" style={{ alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <Text
                  label={`Schritt ${i + 1}`}
                  value={s.title}
                  onChange={(v) => setStep(i, { title: v })}
                />
              </div>
              <div style={{ flex: 2 }}>
                <Text
                  label="Ein Satz dazu"
                  value={s.text}
                  onChange={(v) => setStep(i, { text: v })}
                />
              </div>
              <button
                type="button"
                className="btn small"
                disabled={steps.length <= 2}
                aria-label={`Schritt ${i + 1} entfernen`}
                onClick={() => up({ steps: steps.filter((_, j) => j !== i) })}
              >
                ×
              </button>
            </div>
          ))}
          <div className="row">
            <button
              type="button"
              className="btn small"
              disabled={steps.length >= 6}
              onClick={() => up({ steps: [...steps, { title: 'Neuer Schritt', text: '' }] })}
            >
              + Schritt
            </button>
          </div>
        </>
      );
    }
    case 'quote':
      return (
        <>
          {(b.lines as Inline[]).map((l, i) => (
            <InlineField
              key={i}
              label={`Zeile ${i + 1}`}
              value={l}
              onChange={(v) =>
                up({ lines: b.lines.map((x: Inline, j: number) => (j === i ? v : x)) })
              }
            />
          ))}
        </>
      );
    case 'interactive_demo': {
      const d = b.demo;
      const setD = (patch: Record<string, unknown>) => up({ demo: { ...d, ...patch } });
      const type = DEMO_TYPES.find((t) => t.component === d.component);
      return (
        <>
          <p className="small muted" style={{ margin: '0 0 4px' }}>
            Demo: {type?.label ?? d.component}
          </p>
          <Text
            label="Navigations-Label"
            value={b.navLabel}
            onChange={(v) => up({ navLabel: v })}
          />
          {d.component === 'pick-and-mix' ? (
            <PickAndMixForm d={d} setD={setD} />
          ) : (
            <p className="muted small">Für diese Demo gibt es kein Formular.</p>
          )}
        </>
      );
    }
    case 'gallery': {
      const items: { mediaId: string; caption?: string }[] = b.items;
      const setItems = (n: typeof items) => up({ items: n });
      const move = (i: number, by: number) => {
        const n = [...items];
        const [x] = n.splice(i, 1);
        n.splice(i + by, 0, x!);
        setItems(n);
      };
      return (
        <>
          <Field label="Darstellung">
            <select value={b.layout ?? 'strip'} onChange={(e) => up({ layout: e.target.value })}>
              <option value="strip">Streifen (horizontal scrollbar)</option>
              <option value="grid">Raster (zwei Spalten)</option>
            </select>
          </Field>
          {items.map((it, i) => (
            <div key={i} className="row" style={{ marginBottom: 8 }}>
              <MediaThumb id={it.mediaId} />
              <input
                style={{ flex: 1 }}
                placeholder="Bildunterschrift (optional, nur im Raster sichtbar)"
                aria-label={`Bildunterschrift Bild ${i + 1}`}
                value={it.caption ?? ''}
                onChange={(e) =>
                  setItems(
                    items.map((x, j) =>
                      j === i ? { ...x, caption: e.target.value || undefined } : x,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="btn small"
                disabled={i === 0}
                aria-label="Nach vorn"
                onClick={() => move(i, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn small"
                disabled={i === items.length - 1}
                aria-label="Nach hinten"
                onClick={() => move(i, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="btn small"
                onClick={() => setItems(items.filter((_, j) => j !== i))}
              >
                Entfernen
              </button>
            </div>
          ))}
          <MediaField
            label="Bild hinzufügen"
            value={null}
            onChange={(v) => v && setItems([...items, { mediaId: v }])}
          />
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            Alt-Texte kommen aus der Medienbibliothek.
          </p>
        </>
      );
    }
    case 'heading':
      return (
        <div className="grid2">
          <Text label="Text" value={b.text} onChange={(v) => up({ text: v })} />
          <Field label="Ebene">
            <select value={b.level} onChange={(e) => up({ level: Number(e.target.value) })}>
              <option value={2}>H2</option>
              <option value={3}>H3</option>
            </select>
          </Field>
        </div>
      );
    case 'image':
      return (
        <>
          <MediaField label="Bild" value={b.mediaId} onChange={(v) => up({ mediaId: v ?? '' })} />
          <div className="grid2">
            <Field label="Größe">
              <select value={b.size ?? 'medium'} onChange={(e) => up({ size: e.target.value })}>
                <option value="small">Klein (ein Drittel der Textspalte)</option>
                <option value="medium">Mittel (zwei Drittel)</option>
                <option value="large">Groß (ganze Textspalte)</option>
                <option value="full">Volle Breite (über die ganze Seite)</option>
              </select>
            </Field>
            <Text
              label="Bildunterschrift (optional)"
              value={b.caption}
              onChange={(v) => up({ caption: v || undefined })}
            />
          </div>
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            Der Alt-Text für Screenreader und Suchmaschinen kommt aus der Medienbibliothek.
          </p>
        </>
      );
    case 'richtext':
      return (
        <>
          {(b.nodes as any[]).map((n, i) => (
            <div key={i} className="row" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                {n.kind === 'paragraph' ? (
                  <InlineField
                    label={`Absatz ${i + 1}`}
                    value={n.runs}
                    multiline
                    onChange={(v) =>
                      up({
                        nodes: b.nodes.map((x: any, j: number) =>
                          j === i ? { ...x, runs: v } : x,
                        ),
                      })
                    }
                  />
                ) : (
                  <Field label={`Liste ${i + 1} (ein Punkt pro Zeile)`}>
                    <textarea
                      value={n.items.map((it: Inline) => it.map((r) => r.text).join('')).join('\n')}
                      onChange={(e) =>
                        up({
                          nodes: b.nodes.map((x: any, j: number) =>
                            j === i
                              ? { ...x, items: e.target.value.split('\n').filter(Boolean).map(run) }
                              : x,
                          ),
                        })
                      }
                    />
                  </Field>
                )}
              </div>
              <button
                type="button"
                className="btn small"
                onClick={() => up({ nodes: b.nodes.filter((_: unknown, j: number) => j !== i) })}
              >
                ×
              </button>
            </div>
          ))}
          <div className="row">
            <button
              type="button"
              className="btn small"
              onClick={() =>
                up({ nodes: [...b.nodes, { kind: 'paragraph', runs: run('Neuer Absatz') }] })
              }
            >
              + Absatz
            </button>
            <button
              type="button"
              className="btn small"
              onClick={() =>
                up({ nodes: [...b.nodes, { kind: 'list', ordered: false, items: [run('Punkt')] }] })
              }
            >
              + Liste
            </button>
          </div>
        </>
      );
    default:
      return <p className="muted small">Für diesen Block gibt es kein Formular.</p>;
  }
}
