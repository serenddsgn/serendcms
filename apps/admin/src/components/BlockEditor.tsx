import { useQuery } from '@tanstack/react-query';
import { createContext, useContext } from 'react';
import type { Inline } from '@serend/schema';
import { api } from '../api';
import { Field } from '../ui';
import { InlineField } from './InlineField';
import { MediaField } from './MediaPicker';
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
  image: 'Bild',
};

export function newBlock(type: string): Block {
  const id = uid();
  switch (type) {
    case 'chapter':
      return { id, type, title: 'Neues Kapitel', lead: run('Einleitung'), body: [] };
    case 'quote':
      return { id, type, lines: [run('Erste Zeile'), [{ text: 'Zweite Zeile', liquid: true }]] };
    case 'interactive_demo':
      return {
        id,
        type,
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
      };
    case 'heading':
      return { id, type, level: 2, text: 'Überschrift' };
    case 'richtext':
      return { id, type, nodes: [{ kind: 'paragraph', runs: run('Text') }] };
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
          {allowed.map((t) => (
            <button
              key={t}
              type="button"
              className="btn small"
              onClick={() => onChange([...blocks, newBlock(t)])}
            >
              + {BLOCK_LABELS[t] ?? t}
            </button>
          ))}
        </div>
      )}
    </LocaleContext.Provider>
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
          <Text label="Einleitung" value={b.intro} area onChange={(v) => up({ intro: v })} />
          <LinkForm label="Link" value={b.link} onChange={(v) => up({ link: v })} />
        </>
      );
    case 'featured_projects':
      return (
        <>
          <Text label="Beschriftung" value={b.label} onChange={(v) => up({ label: v })} />
          <Field label="Anzahl (1–5)">
            <input
              type="number"
              min={1}
              max={5}
              value={b.limit ?? 5}
              onChange={(e) => up({ limit: Number(e.target.value) })}
            />
          </Field>
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
      return (
        <>
          <Text
            label="Navigations-Label"
            value={b.navLabel}
            onChange={(v) => up({ navLabel: v })}
          />
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
                    flavors: d.flavors.map((x: any, j: number) =>
                      j === i ? { ...x, name: v } : x,
                    ),
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
