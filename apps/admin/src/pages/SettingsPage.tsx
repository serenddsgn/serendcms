import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useSession } from '../session';
import { Field, LocaleSwitch, Notice, errText, useAction, useLocale } from '../ui';

/* eslint-disable @typescript-eslint/no-explicit-any */
type S = { key: string; locale: string; value: any };
const FIELDS: Record<string, [string, string][]> = {
  'site.identity': [
    ['name', 'Name'],
    ['city', 'Stadt'],
    ['email', 'E-Mail'],
  ],
  'site.footer': [
    ['madeWith', 'Fußzeile: „Gemacht mit …“'],
    ['copyright', 'Copyright'],
  ],
  'seo.defaults': [
    ['siteName', 'Seitenname'],
    ['description', 'Standard-Beschreibung'],
  ],
  organization: [
    ['legalName', 'Rechtlicher Name'],
    ['description', 'Beschreibung'],
  ],
  'site.cta': [['label', 'Beschriftung des Buttons']],
};

export function SettingsPage() {
  const { user } = useSession();
  const [locale, setLocale] = useLocale();
  const q = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<{ settings: S[] }>('/settings'),
  });
  const pages = useQuery({
    queryKey: ['pages', locale],
    queryFn: () => api.get<{ pages: any[] }>(`/pages?locale=${locale}`),
  });
  const save = useAction(
    (v: { key: string; value: any }) =>
      api.put(`/settings/${v.key}?locale=${locale}`, { value: v.value }),
    [['settings'], ['status']],
  );
  const isAdmin = user.role === 'admin';
  return (
    <>
      <div className="row between">
        <div>
          <h1>Einstellungen</h1>
          <p className="muted">
            {isAdmin
              ? 'Änderungen lösen einen neuen Build aus.'
              : 'Nur Administratoren dürfen Einstellungen ändern.'}
          </p>
        </div>
        <LocaleSwitch value={locale} onChange={setLocale} />
      </div>
      {(q.error || save.error) && <Notice>{errText(q.error ?? save.error)}</Notice>}
      {Object.keys(FIELDS).map((key) => {
        const cur = q.data?.settings.find((s) => s.key === key && s.locale === locale)?.value ?? {};
        return (
          <SettingCard
            key={`${key}-${locale}-${JSON.stringify(cur)}`}
            name={key}
            value={cur}
            disabled={!isAdmin}
            pages={pages.data?.pages ?? []}
            onSave={(value) => save.mutate({ key, value })}
          />
        );
      })}
    </>
  );
}

function SettingCard({
  name,
  value,
  disabled,
  pages,
  onSave,
}: {
  name: string;
  value: any;
  disabled: boolean;
  pages: any[];
  onSave: (v: any) => void;
}) {
  const [v, setV] = useState<any>(value);
  return (
    <div className="card">
      <h3>{name}</h3>
      <div className="grid2">
        {FIELDS[name]!.map(([k, label]) => (
          <Field key={k} label={label}>
            <input
              disabled={disabled}
              value={v[k] ?? ''}
              onChange={(e) => setV({ ...v, [k]: e.target.value || undefined })}
            />
          </Field>
        ))}
      </div>
      {name === 'site.cta' && (
        <div className="grid2">
          <Field label="Zielseite">
            <select
              disabled={disabled}
              value={v.target?.pageId ?? ''}
              onChange={(e) =>
                setV({
                  ...v,
                  target: { kind: 'page', pageId: e.target.value, fragment: v.target?.fragment },
                })
              }
            >
              <option value="">– wählen –</option>
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Anker">
            <input
              disabled={disabled}
              value={v.target?.fragment ?? ''}
              onChange={(e) =>
                setV({ ...v, target: { ...v.target, fragment: e.target.value || undefined } })
              }
            />
          </Field>
        </div>
      )}
      {!disabled && (
        <button className="btn primary small" onClick={() => onSave(v)}>
          Speichern
        </button>
      )}
    </div>
  );
}
