import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { homePath, pagePath, projectIndexPath } from '@serend/schema';
import { api } from '../api';
import { AutoTranslateButton, autoTranslateNotice } from '../components/AutoTranslate';
import { TranslationPanel } from '../components/Translations';
import { BlockEditor, newBlock, type Block } from '../components/BlockEditor';
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
  systemKey: string | null;
  status: string;
  title: string;
  slug: string;
  hasUnpublishedChanges: boolean;
}

export function PagesPage() {
  const [locale, setLocale] = useLocale();
  const warningsFor = useLiveWarnings();
  const [creating, setCreating] = useState(false);
  const q = useQuery({
    queryKey: ['pages', locale],
    queryFn: () => api.get<{ pages: Item[] }>(`/pages?locale=${locale}`),
  });
  return (
    <>
      <div className="row between">
        <div>
          <h1>Seiten</h1>
          <p className="muted">
            Startseite und Projektübersicht haben eine feste Struktur; Impressum, Datenschutz & Co.
            sind freie Seiten.
          </p>
        </div>
        <div className="row">
          <LocaleSwitch value={locale} onChange={setLocale} />
          <button className="btn primary" onClick={() => setCreating(true)}>
            Neue Seite
          </button>
        </div>
      </div>
      {q.error && <Notice>{errText(q.error)}</Notice>}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Titel</th>
              <th>Slug</th>
              <th>Typ</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {q.data?.pages.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link to={`/pages/${p.id}`}>
                    <strong>{p.title}</strong>
                  </Link>
                </td>
                <td>/{p.slug}</td>
                <td>{p.systemKey ?? 'frei'}</td>
                <td>
                  <Pill value={p.status} />
                  {p.hasUnpublishedChanges && p.status === 'published' && (
                    <span className="pill">Änderungen offen</span>
                  )}
                  <WarnBadge
                    warnings={warningsFor([
                      p.systemKey === 'home'
                        ? homePath(locale)
                        : p.systemKey === 'projects'
                          ? projectIndexPath(locale)
                          : pagePath(locale, p.slug),
                    ])}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {creating && <CreatePage locale={locale} onClose={() => setCreating(false)} />}
    </>
  );
}

function CreatePage({ locale, onClose }: { locale: string; onClose: () => void }) {
  const nav = useNavigate();
  const { register, handleSubmit } = useForm({ defaultValues: { title: '', slug: '' } });
  const create = useAction(
    (v: any) =>
      api.post<{ page: { id: string } }>('/pages', {
        locale,
        title: v.title,
        slug: v.slug,
        content: [newBlock('page_title')].map((b) => ({ ...b, title: v.title })),
      }),
    [['pages']],
    (r) => nav(`/pages/${r.page.id}`),
  );
  return (
    <Modal title="Neue Seite" onClose={onClose}>
      <form onSubmit={handleSubmit((v) => create.mutate(v))}>
        {create.error && <Notice>{errText(create.error)}</Notice>}
        <Field label="Titel">
          <input {...register('title', { required: true })} />
        </Field>
        <Field label="Slug (URL)">
          <input {...register('slug', { required: true })} placeholder="impressum" />
        </Field>
        <button className="btn primary" disabled={create.isPending}>
          Anlegen
        </button>
      </form>
    </Modal>
  );
}

export function PageEditPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['page', id], queryFn: () => api.get<any>(`/pages/${id}`) });
  const d = q.data;
  const form = useForm<any>();
  const [content, setContent] = useState<Block[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!d) return;
    form.reset({
      slug: d.latest.slug,
      title: d.latest.title,
      seoTitle: d.latest.seoTitle ?? '',
      seoDescription: d.latest.seoDescription ?? '',
    });
    setContent(d.latest.content);
  }, [d, form]);
  const body = () => {
    const v = form.getValues();
    return {
      slug: v.slug,
      title: v.title,
      content,
      seoTitle: v.seoTitle || null,
      seoDescription: v.seoDescription || null,
      ogMediaId: d.latest.ogMediaId,
      expectedRevisionNo: d.latest.revisionNo,
    };
  };
  const keys = [['page', id], ['pages'], ['status']];
  const save = useAction(
    () => api.put(`/pages/${id}/draft`, body()),
    keys,
    () => setMsg('Gespeichert.'),
  );
  const publish = useAction(
    async () => {
      await api.put(`/pages/${id}/draft`, body());
      return api.post(`/pages/${id}/publish`);
    },
    keys,
    () => setMsg('Veröffentlicht. Der Build wurde angestoßen.'),
  );
  const unpublish = useAction(
    () => api.post(`/pages/${id}/unpublish`),
    keys,
    () => setMsg('Zurück zum Entwurf.'),
  );
  const preview = useAction(
    () => api.post<{ url: string }>(`/pages/${id}/preview-link`),
    [],
    (r) => window.open(r.url, '_blank', 'noopener'),
  );
  const autoTranslate = useAction(
    () => {
      const b = body();
      return api.post<any>(`/pages/${id}/auto-translate`, {
        title: b.title,
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
      setContent(r.content);
      setMsg(autoTranslateNotice(r.model));
    },
  );
  const translate = useAction(
    (locale: string) => api.post<any>(`/pages/${id}/translations`, { locale }),
    [['pages']],
    (r) => nav(`/pages/${r.page.id}`),
  );
  const remove = useAction(
    () => api.del(`/pages/${id}`),
    [['pages']],
    () => nav('/pages'),
  );
  if (q.error) return <Notice>{errText(q.error)}</Notice>;
  if (!d) return <p className="muted">Lädt …</p>;
  const system = d.page.systemKey !== null;
  const err =
    save.error ??
    publish.error ??
    unpublish.error ??
    preview.error ??
    translate.error ??
    autoTranslate.error ??
    remove.error;
  return (
    <>
      <p>
        <Link to="/pages">← Seiten</Link>
      </p>
      <div className="row between">
        <div>
          <h1>{d.latest.title}</h1>
          <div className="row">
            <Pill value={d.page.status} />
            <span className="muted small">
              Revision {d.latest.revisionNo} · {d.page.locale.toUpperCase()} ·{' '}
              {fmtDate(d.latest.updatedAt)}
              {system ? ` · Systemseite (${d.page.systemKey})` : ''}
            </span>
          </div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => preview.mutate(undefined)}>
            Vorschau
          </button>
          <AutoTranslateButton
            kind="pages"
            groupId={d.page.translationGroupId}
            locale={d.page.locale}
            pending={autoTranslate.isPending}
            onConfirm={() => autoTranslate.mutate(undefined)}
          />
          <button className="btn" onClick={() => save.mutate(undefined)}>
            Entwurf speichern
          </button>
          <button className="btn primary" onClick={() => publish.mutate(undefined)}>
            Veröffentlichen
          </button>
        </div>
      </div>
      {err && <Notice>{errText(err)}</Notice>}
      {msg && !err && <Notice kind="ok">{msg}</Notice>}
      <div className="card grid2">
        <Field label="Titel">
          <input {...form.register('title')} />
        </Field>
        <Field label="Slug">
          <input {...form.register('slug')} disabled={system} />
        </Field>
        <Field label="SEO-Titel">
          <input {...form.register('seoTitle')} />
        </Field>
        <Field label="SEO-Beschreibung">
          <input {...form.register('seoDescription')} />
        </Field>
      </div>
      <h2>Inhalt</h2>
      <BlockEditor
        locale={d.page.locale}
        blocks={content}
        onChange={setContent}
        allowed={system ? [] : ['page_title', 'heading', 'richtext', 'image']}
      />
      <TranslationPanel
        kind="pages"
        id={id}
        locale={d.page.locale}
        groupId={d.page.translationGroupId}
        systemKey={d.page.systemKey}
        onCopy={(l) => translate.mutate(l)}
        copying={translate.isPending}
      />
      <div className="row" style={{ marginTop: 20 }}>
        {d.page.status === 'published' && (
          <button className="btn" onClick={() => unpublish.mutate(undefined)}>
            Zurück zum Entwurf
          </button>
        )}
        {!system && (
          <button
            className="btn danger"
            onClick={() => confirm('Endgültig löschen?') && remove.mutate(undefined)}
          >
            Löschen
          </button>
        )}
      </div>
    </>
  );
}
