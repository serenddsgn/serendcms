import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { api } from '../api';
import { MediaField } from '../components/MediaPicker';
import { Sortable } from '../components/Sortable';
import { Field, LocaleSwitch, Notice, Pill, errText, useAction, useLocale } from '../ui';

/* eslint-disable @typescript-eslint/no-explicit-any */
const STATUS = ['draft', 'published', 'archived'];

export function ServicesPage() {
  const [locale, setLocale] = useLocale();
  const q = useQuery({
    queryKey: ['services', locale],
    queryFn: () => api.get<{ items: any[] }>(`/services?locale=${locale}`),
  });
  const keys = [['services', locale]];
  const order = useAction((ids: string[]) => api.put('/services/order', { ids }), keys);
  const update = useAction(
    (v: { id: string; patch: any }) => api.patch(`/services/${v.id}`, v.patch),
    keys,
  );
  const remove = useAction((id: string) => api.del(`/services/${id}`), keys);
  const create = useAction((v: any) => api.post('/services', { locale, ...v }), keys);
  const { register, handleSubmit, reset } = useForm({
    defaultValues: { key: 'web', name: '', description: '', status: 'published' },
  });
  const err = q.error ?? order.error ?? update.error ?? remove.error ?? create.error;
  return (
    <>
      <div className="row between">
        <div>
          <h1>Leistungen</h1>
          <p className="muted">Die Namen erscheinen auch als Filter auf der Projektseite.</p>
        </div>
        <LocaleSwitch value={locale} onChange={setLocale} />
      </div>
      {err && <Notice>{errText(err)}</Notice>}
      <Sortable
        items={q.data?.items ?? []}
        getId={(s) => s.id}
        onReorder={(n) => order.mutate(n.map((s) => s.id))}
        render={(s, _i, handle) => (
          <div className="sortable">
            <div className="row">
              {handle}
              <strong>{s.key}</strong>
              <Pill value={s.status} />
            </div>
            <div className="grid2">
              <Field label="Name">
                <input
                  defaultValue={s.name}
                  onBlur={(e) =>
                    e.target.value !== s.name &&
                    update.mutate({ id: s.id, patch: { name: e.target.value } })
                  }
                />
              </Field>
              <Field label="Status">
                <select
                  defaultValue={s.status}
                  onChange={(e) => update.mutate({ id: s.id, patch: { status: e.target.value } })}
                >
                  {STATUS.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Beschreibung">
              <textarea
                defaultValue={s.description}
                onBlur={(e) =>
                  e.target.value !== s.description &&
                  update.mutate({ id: s.id, patch: { description: e.target.value } })
                }
              />
            </Field>
            <button
              className="btn small danger"
              onClick={() => confirm('Leistung löschen?') && remove.mutate(s.id)}
            >
              Löschen
            </button>
          </div>
        )}
      />
      <h2>Neue Leistung</h2>
      <form
        className="card"
        onSubmit={handleSubmit((v) => {
          create.mutate(v);
          reset();
        })}
      >
        <div className="grid3">
          <Field label="Bereich">
            <select {...register('key')}>
              <option value="web">web</option>
              <option value="shop">shop</option>
              <option value="brand">brand</option>
              <option value="print">print</option>
            </select>
          </Field>
          <Field label="Name">
            <input {...register('name', { required: true })} />
          </Field>
          <Field label="Status">
            <select {...register('status')}>
              {STATUS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Beschreibung">
          <textarea {...register('description', { required: true })} />
        </Field>
        <button className="btn primary">Anlegen</button>
      </form>
    </>
  );
}

export function NavigationPage() {
  const [locale, setLocale] = useLocale();
  const q = useQuery({
    queryKey: ['navigation', locale],
    queryFn: () => api.get<{ items: any[] }>(`/navigation?locale=${locale}`),
  });
  const pages = useQuery({
    queryKey: ['pages', locale],
    queryFn: () => api.get<{ pages: any[] }>(`/pages?locale=${locale}`),
  });
  const keys = [['navigation', locale]];
  const order = useAction((ids: string[]) => api.put('/navigation/order', { ids }), keys);
  const update = useAction(
    (v: { id: string; patch: any }) => api.patch(`/navigation/${v.id}`, v.patch),
    keys,
  );
  const remove = useAction((id: string) => api.del(`/navigation/${id}`), keys);
  const create = useAction((v: any) => api.post('/navigation', { locale, ...v }), keys);
  const { register, handleSubmit, reset, watch } = useForm({
    defaultValues: {
      location: 'header',
      label: '',
      kind: 'page',
      pageId: '',
      fragment: '',
      url: '',
      status: 'published',
    },
  });
  const kind = watch('kind');
  const target = (v: any) =>
    v.kind === 'page'
      ? { kind: 'page', pageId: v.pageId, fragment: v.fragment || null }
      : { kind: 'url', url: v.url };
  const err = q.error ?? order.error ?? update.error ?? remove.error ?? create.error;
  return (
    <>
      <div className="row between">
        <div>
          <h1>Navigation</h1>
          <p className="muted">
            Kopfzeile, Footer und „Rechtliches“. Einträge auf unveröffentlichte Seiten erscheinen
            erst mit der Seite.
          </p>
        </div>
        <LocaleSwitch value={locale} onChange={setLocale} />
      </div>
      {err && <Notice>{errText(err)}</Notice>}
      <Sortable
        items={q.data?.items ?? []}
        getId={(n) => n.id}
        onReorder={(n) => order.mutate(n.map((x) => x.id))}
        render={(n, _i, handle) => (
          <div className="sortable row between">
            <div className="row">
              {handle}
              <strong>{n.label}</strong>
              <span className="pill">{n.location}</span>
              <span className="muted small">
                {n.target.kind === 'page'
                  ? `Seite${n.target.fragment ? `#${n.target.fragment}` : ''}`
                  : n.target.url}
              </span>
            </div>
            <div className="row">
              <select
                aria-label="Status"
                value={n.status}
                onChange={(e) => update.mutate({ id: n.id, patch: { status: e.target.value } })}
              >
                {STATUS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <button className="btn small danger" onClick={() => remove.mutate(n.id)}>
                Löschen
              </button>
            </div>
          </div>
        )}
      />
      <h2>Neuer Eintrag</h2>
      <form
        className="card"
        onSubmit={handleSubmit((v) => {
          create.mutate({
            location: v.location,
            label: v.label,
            status: v.status,
            target: target(v),
          });
          reset();
        })}
      >
        <div className="grid3">
          <Field label="Bereich">
            <select {...register('location')}>
              <option value="header">Kopfzeile</option>
              <option value="footer">Footer</option>
              <option value="legal">Rechtliches</option>
            </select>
          </Field>
          <Field label="Beschriftung">
            <input {...register('label', { required: true })} />
          </Field>
          <Field label="Ziel">
            <select {...register('kind')}>
              <option value="page">Seite</option>
              <option value="url">URL</option>
            </select>
          </Field>
        </div>
        {kind === 'page' ? (
          <div className="grid2">
            <Field label="Seite">
              <select {...register('pageId', { required: true })}>
                <option value="">– wählen –</option>
                {pages.data?.pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Anker (optional)">
              <input {...register('fragment')} placeholder="leistungen" />
            </Field>
          </div>
        ) : (
          <Field label="URL">
            <input {...register('url')} placeholder="https://…" />
          </Field>
        )}
        <button className="btn primary">Anlegen</button>
      </form>
    </>
  );
}

export function TeamPage() {
  const [locale, setLocale] = useLocale();
  const q = useQuery({
    queryKey: ['team', locale],
    queryFn: () => api.get<{ items: any[] }>(`/team?locale=${locale}`),
  });
  const keys = [['team', locale]];
  const order = useAction((ids: string[]) => api.put('/team/order', { ids }), keys);
  const update = useAction(
    (v: { id: string; patch: any }) => api.patch(`/team/${v.id}`, v.patch),
    keys,
  );
  const remove = useAction((id: string) => api.del(`/team/${id}`), keys);
  const create = useAction((v: any) => api.post('/team', { locale, ...v }), keys);
  const [photo, setPhoto] = useState<string | null>(null);
  const { register, handleSubmit, reset } = useForm({
    defaultValues: { name: '', roleTitle: '', bio: '', status: 'draft' },
  });
  const err = q.error ?? order.error ?? update.error ?? remove.error ?? create.error;
  return (
    <>
      <div className="row between">
        <div>
          <h1>Team</h1>
          <p className="muted">
            Das Design sieht noch keine Teamseite vor; die Daten werden schon gepflegt und noch
            nicht ausgeliefert.
          </p>
        </div>
        <LocaleSwitch value={locale} onChange={setLocale} />
      </div>
      {err && <Notice>{errText(err)}</Notice>}
      <Sortable
        items={q.data?.items ?? []}
        getId={(t) => t.id}
        onReorder={(n) => order.mutate(n.map((x) => x.id))}
        render={(t, _i, handle) => (
          <div className="sortable row between">
            <div className="row">
              {handle}
              <div>
                <strong>{t.name}</strong>
                <div className="small muted">{t.roleTitle}</div>
              </div>
            </div>
            <div className="row">
              <select
                aria-label="Status"
                value={t.status}
                onChange={(e) => update.mutate({ id: t.id, patch: { status: e.target.value } })}
              >
                {STATUS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <button className="btn small danger" onClick={() => remove.mutate(t.id)}>
                Löschen
              </button>
            </div>
          </div>
        )}
      />
      <h2>Neues Teammitglied</h2>
      <form
        className="card"
        onSubmit={handleSubmit((v) => {
          create.mutate({ ...v, bio: v.bio || null, photoMediaId: photo });
          reset();
          setPhoto(null);
        })}
      >
        <div className="grid2">
          <Field label="Name">
            <input {...register('name', { required: true })} />
          </Field>
          <Field label="Rolle">
            <input {...register('roleTitle', { required: true })} />
          </Field>
        </div>
        <Field label="Kurzvita">
          <textarea {...register('bio')} />
        </Field>
        <MediaField label="Foto" value={photo} onChange={setPhoto} />
        <button className="btn primary">Anlegen</button>
      </form>
    </>
  );
}
