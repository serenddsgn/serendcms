import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { projectPath } from '@serend/schema';
import { api } from '../api';
import { AutoTranslateButton, autoTranslateNotice } from '../components/AutoTranslate';
import { BlockEditor, type Block } from '../components/BlockEditor';
import { InlineField } from '../components/InlineField';
import { MediaField, MediaThumb } from '../components/MediaPicker';
import { Sortable } from '../components/Sortable';
import { WarnBadge, useLiveWarnings } from '../warnings';
import {
  Field,
  LocaleSwitch,
  Modal,
  Notice,
  Pill,
  errText,
  fmtDate,
  useAction,
  useLocale,
} from '../ui';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Item {
  id: string;
  locale: string;
  status: string;
  title: string;
  slug: string;
  year: number;
  featured: boolean;
  hasUnpublishedChanges: boolean;
  coverMediaId: string | null;
}
const CATS = [
  ['web', 'Webdesign'],
  ['shop', 'E-Commerce'],
  ['brand', 'Branding'],
  ['print', 'Druckbares'],
] as const;

export function ProjectsPage() {
  const [locale, setLocale] = useLocale();
  const warningsFor = useLiveWarnings();
  const [creating, setCreating] = useState(false);
  const q = useQuery({
    queryKey: ['projects', locale],
    queryFn: () => api.get<{ projects: Item[] }>(`/projects?locale=${locale}`),
  });
  const order = useAction(
    (ids: string[]) => api.put('/projects/order', { locale, ids }),
    [['projects', locale]],
  );
  return (
    <>
      <div className="row between">
        <div>
          <h1>Projekte</h1>
          <p className="muted">Reihenfolge per Drag & Drop (Griff links).</p>
        </div>
        <div className="row">
          <LocaleSwitch value={locale} onChange={setLocale} />
          <button className="btn primary" onClick={() => setCreating(true)}>
            Neues Projekt
          </button>
        </div>
      </div>
      {(q.error || order.error) && <Notice>{errText(q.error ?? order.error)}</Notice>}
      <Sortable
        items={q.data?.projects ?? []}
        getId={(p) => p.id}
        onReorder={(next) => order.mutate(next.map((p) => p.id))}
        render={(p, _i, handle) => (
          <div className="sortable row between">
            <div className="row">
              {handle}
              <MediaThumb id={p.coverMediaId} />
              <div>
                <Link to={`/projects/${p.id}`}>
                  <strong>{p.title}</strong>
                </Link>
                <div className="small muted">
                  /{p.slug} · {p.year}
                  {p.featured ? ' · hervorgehoben' : ''}
                </div>
              </div>
            </div>
            <div className="row">
              <Pill value={p.status} />
              {p.hasUnpublishedChanges && p.status === 'published' && (
                <span className="pill">Änderungen offen</span>
              )}
              <WarnBadge warnings={warningsFor([projectPath(locale, p.slug)])} />
            </div>
          </div>
        )}
      />
      {q.data?.projects.length === 0 && <p className="muted">Keine Projekte in dieser Sprache.</p>}
      {creating && <CreateProject locale={locale} onClose={() => setCreating(false)} />}
    </>
  );
}

function CreateProject({ locale, onClose }: { locale: string; onClose: () => void }) {
  const nav = useNavigate();
  const { register, handleSubmit } = useForm({
    defaultValues: {
      title: '',
      slug: '',
      year: new Date().getFullYear(),
      category: 'web',
      color: '#444444',
    },
  });
  const create = useAction(
    (v: any) =>
      api.post<{ project: { id: string } }>('/projects', {
        locale,
        title: v.title,
        slug: v.slug,
        year: Number(v.year),
        categories: [v.category],
        color: v.color,
      }),
    [['projects']],
    (r) => nav(`/projects/${r.project.id}`),
  );
  return (
    <Modal title="Neues Projekt" onClose={onClose}>
      <form onSubmit={handleSubmit((v) => create.mutate(v))}>
        {create.error && <Notice>{errText(create.error)}</Notice>}
        <Field label="Titel">
          <input {...register('title', { required: true })} />
        </Field>
        <Field label="Slug (URL)">
          <input
            {...register('slug', { required: true, pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/ })}
            placeholder="mein-projekt"
          />
        </Field>
        <div className="grid3">
          <Field label="Jahr">
            <input type="number" {...register('year')} />
          </Field>
          <Field label="Bereich">
            <select {...register('category')}>
              {CATS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Farbe">
            <input type="color" {...register('color')} />
          </Field>
        </div>
        <button className="btn primary" disabled={create.isPending}>
          Anlegen
        </button>
      </form>
    </Modal>
  );
}

const nn = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

export function ProjectEditPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['project', id], queryFn: () => api.get<any>(`/projects/${id}`) });
  const d = q.data;
  const siblings = useQuery({
    queryKey: ['projects', d?.project.locale],
    enabled: !!d,
    queryFn: () => api.get<{ projects: Item[] }>(`/projects?locale=${d.project.locale}`),
  });
  const form = useForm<any>();
  const [content, setContent] = useState<Block[]>([]);
  const [gallery, setGallery] = useState<
    { mediaId: string; altOverride: string | null; key: string }[]
  >([]);
  const [meta, setMeta] = useState<any>({});
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!d) return;
    const l = d.latest;
    form.reset({
      slug: l.slug,
      title: l.title,
      year: l.year,
      categories: l.categories,
      color: l.color,
      tileColor: l.tileColor ?? '',
      client: l.client ?? '',
      liveUrl: l.liveUrl ?? '',
      seoTitle: l.seoTitle ?? '',
      seoDescription: l.seoDescription ?? '',
      nextProjectId: l.nextProjectId ?? '',
    });
    setContent(l.content);
    setGallery(l.gallery.map((g: any) => ({ ...g, key: crypto.randomUUID() })));
    setMeta({ subtitle: l.subtitle, coverMediaId: l.coverMediaId, ogMediaId: l.ogMediaId });
  }, [d, form]);

  const body = () => {
    const v = form.getValues();
    return {
      slug: v.slug,
      title: v.title,
      subtitle: meta.subtitle?.length ? meta.subtitle : null,
      year: Number(v.year),
      categories: v.categories,
      color: v.color,
      tileColor: nn(v.tileColor),
      client: nn(v.client),
      liveUrl: nn(v.liveUrl),
      coverMediaId: meta.coverMediaId ?? null,
      nextProjectId: nn(v.nextProjectId),
      content,
      gallery: gallery.map(({ mediaId, altOverride }) => ({
        mediaId,
        altOverride: nn(altOverride ?? ''),
      })),
      seoTitle: nn(v.seoTitle),
      seoDescription: nn(v.seoDescription),
      ogMediaId: meta.ogMediaId ?? null,
      expectedRevisionNo: d.latest.revisionNo,
    };
  };
  const done = (r: any) => {
    qc(r);
    setMsg('Gespeichert.');
  };
  const keys = [['project', id], ['projects'], ['status']];
  const qc = (r: any) => void r;
  const save = useAction(() => api.put<any>(`/projects/${id}/draft`, body()), keys, done);
  const publish = useAction(
    async () => {
      await api.put(`/projects/${id}/draft`, body());
      return api.post<any>(`/projects/${id}/publish`);
    },
    keys,
    () => setMsg('Veröffentlicht. Der Build der Seite wurde angestoßen.'),
  );
  const act = useAction(
    (a: string) => api.post<any>(`/projects/${id}/${a}`),
    keys,
    () => setMsg('Erledigt.'),
  );
  const preview = useAction(
    () => api.post<{ url: string }>(`/projects/${id}/preview-link`),
    [],
    (r) => window.open(r.url, '_blank', 'noopener'),
  );
  const autoTranslate = useAction(
    () => {
      const b = body();
      return api.post<any>(`/projects/${id}/auto-translate`, {
        title: b.title,
        subtitle: b.subtitle,
        seoTitle: b.seoTitle,
        seoDescription: b.seoDescription,
        content: b.content,
      });
    },
    [],
    (r) => {
      form.setValue('title', r.title, { shouldDirty: true });
      form.setValue('seoTitle', r.seoTitle ?? '', { shouldDirty: true });
      form.setValue('seoDescription', r.seoDescription ?? '', { shouldDirty: true });
      setMeta((m: any) => ({ ...m, subtitle: r.subtitle }));
      setContent(r.content);
      setMsg(autoTranslateNotice(r.model));
    },
  );
  const translate = useAction(
    (locale: string) => api.post<any>(`/projects/${id}/translations`, { locale }),
    [['projects']],
    (r) => nav(`/projects/${r.project.id}`),
  );
  const patchStable = useAction((p: any) => api.patch(`/projects/${id}`, p), keys);
  const remove = useAction(
    () => api.del(`/projects/${id}`),
    [['projects']],
    () => nav('/projects'),
  );

  if (q.error) return <Notice>{errText(q.error)}</Notice>;
  if (!d) return <p className="muted">Lädt …</p>;
  const other = d.project.locale === 'de' ? 'en' : 'de';
  const err =
    save.error ??
    publish.error ??
    act.error ??
    preview.error ??
    translate.error ??
    autoTranslate.error ??
    patchStable.error ??
    remove.error;
  const cats = form.watch('categories') ?? [];
  return (
    <>
      <p>
        <Link to="/projects">← Projekte</Link>
      </p>
      <div className="row between">
        <div>
          <h1>{d.latest.title}</h1>
          <div className="row">
            <Pill value={d.project.status} />
            <span className="muted small">
              Revision {d.latest.revisionNo} · {d.project.locale.toUpperCase()} ·{' '}
              {fmtDate(d.latest.updatedAt)}
            </span>
          </div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => preview.mutate(undefined)}>
            Vorschau
          </button>
          <AutoTranslateButton
            kind="projects"
            groupId={d.project.translationGroupId}
            locale={d.project.locale}
            pending={autoTranslate.isPending}
            onConfirm={() => autoTranslate.mutate(undefined)}
          />
          <button className="btn" onClick={() => save.mutate(undefined)} disabled={save.isPending}>
            Entwurf speichern
          </button>
          <button
            className="btn primary"
            onClick={() => publish.mutate(undefined)}
            disabled={publish.isPending}
          >
            Veröffentlichen
          </button>
        </div>
      </div>
      {err && <Notice>{errText(err)}</Notice>}
      {msg && !err && <Notice kind="ok">{msg}</Notice>}
      <div className="card">
        <div className="grid2">
          <Field label="Titel">
            <input {...form.register('title')} />
          </Field>
          <Field label="Slug">
            <input {...form.register('slug')} />
          </Field>
        </div>
        <InlineField
          label="Untertitel"
          value={meta.subtitle}
          onChange={(v) => setMeta({ ...meta, subtitle: v })}
        />
        <div className="grid3">
          <Field label="Jahr">
            <input type="number" {...form.register('year')} />
          </Field>
          <Field label="Farbe">
            <input type="color" {...form.register('color')} />
          </Field>
          <Field label="Kachel-Farbe (optional)">
            <input {...form.register('tileColor')} placeholder="#303030" />
          </Field>
        </div>
        <div className="row" role="group" aria-label="Bereiche">
          {CATS.map(([k, l]) => (
            <label key={k} className="row">
              <input
                type="checkbox"
                checked={cats.includes(k)}
                onChange={(e) =>
                  form.setValue(
                    'categories',
                    e.target.checked ? [...cats, k] : cats.filter((c: string) => c !== k),
                  )
                }
              />
              {l}
            </label>
          ))}
          <span className="muted small">Der erste Bereich ist der Hauptbereich.</span>
        </div>
        <div className="grid2">
          <Field label="Kunde">
            <input {...form.register('client')} />
          </Field>
          <Field label="Live-URL">
            <input {...form.register('liveUrl')} placeholder="https://…" />
          </Field>
        </div>
        <Field label="Nächstes Projekt (leer = automatisch)">
          <select {...form.register('nextProjectId')}>
            <option value="">automatisch</option>
            {siblings.data?.projects
              .filter((p) => p.id !== id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
          </select>
        </Field>
        <div className="grid2">
          <MediaField
            label="Cover"
            value={meta.coverMediaId}
            onChange={(v) => setMeta({ ...meta, coverMediaId: v })}
          />
          <MediaField
            label="OG-Bild (optional)"
            value={meta.ogMediaId}
            onChange={(v) => setMeta({ ...meta, ogMediaId: v })}
          />
        </div>
      </div>
      <h2>Bildstrecke</h2>
      <div className="card">
        <Sortable
          items={gallery}
          getId={(g) => g.key}
          onReorder={setGallery}
          render={(g, i, handle) => (
            <div className="row" style={{ marginBottom: 8 }}>
              {handle}
              <MediaThumb id={g.mediaId} />
              <input
                style={{ flex: 1 }}
                placeholder="Alt-Text überschreiben (optional)"
                value={g.altOverride ?? ''}
                onChange={(e) =>
                  setGallery(
                    gallery.map((x, j) => (j === i ? { ...x, altOverride: e.target.value } : x)),
                  )
                }
                aria-label="Alt-Text"
              />
              <button
                type="button"
                className="btn small"
                onClick={() => setGallery(gallery.filter((_, j) => j !== i))}
              >
                Entfernen
              </button>
            </div>
          )}
        />
        <MediaField
          label="Bild hinzufügen"
          value={null}
          onChange={(v) =>
            v &&
            setGallery([...gallery, { mediaId: v, altOverride: null, key: crypto.randomUUID() }])
          }
        />
      </div>
      <h2>Inhalt</h2>
      <BlockEditor
        blocks={content}
        onChange={setContent}
        allowed={['chapter', 'quote', 'interactive_demo']}
      />
      <h2>SEO</h2>
      <div className="card grid2">
        <Field label="SEO-Titel">
          <input {...form.register('seoTitle')} />
        </Field>
        <Field label="SEO-Beschreibung">
          <input {...form.register('seoDescription')} />
        </Field>
      </div>
      <h2>Weitere Aktionen</h2>
      <div className="row">
        <label className="row">
          <input
            type="checkbox"
            checked={d.project.featured}
            onChange={(e) => patchStable.mutate({ featured: e.target.checked })}
          />
          Auf der Startseite hervorheben
        </label>
        {d.project.status === 'published' && (
          <button className="btn" onClick={() => act.mutate('unpublish')}>
            Zurück zum Entwurf
          </button>
        )}
        {d.project.status !== 'archived' ? (
          <button className="btn" onClick={() => act.mutate('archive')}>
            Archivieren
          </button>
        ) : (
          <button className="btn" onClick={() => act.mutate('restore')}>
            Wiederherstellen
          </button>
        )}
        <button className="btn" onClick={() => translate.mutate(other)}>
          Sprachversion {other.toUpperCase()} anlegen
        </button>
        <button
          className="btn danger"
          onClick={() =>
            confirm('Endgültig löschen? (nur nie veröffentlichte Projekte)') &&
            remove.mutate(undefined)
          }
        >
          Löschen
        </button>
      </div>
    </>
  );
}
