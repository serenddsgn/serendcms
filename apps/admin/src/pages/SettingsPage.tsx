import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { anthropicKey, useAnthropicStatus } from '../components/AutoTranslate';
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
      <AnthropicCard isAdmin={isAdmin} />
    </>
  );
}

const MODEL_LABELS: Record<string, string> = {
  'claude-opus-5-5': 'Claude Opus 5.5 (beste Qualität)',
  'claude-sonnet-5-5': 'Claude Sonnet 5.5 (schneller, günstiger)',
  'claude-haiku-5-5': 'Claude Haiku 5.5 (am schnellsten und günstigsten)',
};

/** Zugang für die automatische Übersetzung. Der Key wird verschlüsselt gespeichert und nie wieder angezeigt. */
function AnthropicCard({ isAdmin }: { isAdmin: boolean }) {
  const q = useAnthropicStatus();
  const st = q.data?.anthropic;
  const [apiKey, setApiKey] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const save = useAction(
    (v: { apiKey?: string; model?: string }) => api.put('/integrations/anthropic', v),
    [anthropicKey],
    () => {
      setApiKey('');
      setMsg('Gespeichert.');
    },
  );
  const remove = useAction(
    () => api.del('/integrations/anthropic'),
    [anthropicKey],
    () => setMsg('Key entfernt.'),
  );
  const err = q.error ?? save.error ?? remove.error;
  return (
    <div className="card">
      <h3>Automatische Übersetzung (Claude)</h3>
      <p className="muted small">
        Mit einem Anthropic-Key erscheint in Seiten und Projekten der Button „Automatisch
        übersetzen“. Das Ergebnis ist ein Vorschlag und wird erst mit „Entwurf speichern“
        übernommen. Die Texte gehen dafür an die Anthropic-API, die Kosten laufen über den
        hinterlegten Key. Dieser Bereich löst keinen Build aus.
      </p>
      {err && <Notice>{errText(err)}</Notice>}
      {msg && !err && <Notice kind="ok">{msg}</Notice>}
      {st && (
        <p>
          Status:{' '}
          <strong>
            {!st.configured
              ? 'nicht eingerichtet'
              : st.source === 'env'
                ? 'eingerichtet (Key aus der Server-Umgebung)'
                : `eingerichtet (Key endet auf …${st.last4})`}
          </strong>
        </p>
      )}
      {st && !st.canStoreKey && (
        <Notice>
          Der Key kann hier nicht gespeichert werden, weil auf dem Server SECRETS_ENCRYPTION_KEY
          fehlt. Alternativ ANTHROPIC_API_KEY in der Server-Umgebung setzen.
        </Notice>
      )}
      {isAdmin && st ? (
        <>
          <div className="grid2">
            <Field
              label={
                st.source === 'admin' ? 'Neuer Key (ersetzt den gespeicherten)' : 'Anthropic-Key'
              }
            >
              <input
                type="password"
                autoComplete="off"
                placeholder="sk-ant-…"
                value={apiKey}
                disabled={!st.canStoreKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </Field>
            <Field label="Modell">
              <select
                value={st.model}
                onChange={(e) => save.mutate({ model: e.target.value })}
                disabled={save.isPending}
              >
                {st.models.map((m) => (
                  <option key={m} value={m}>
                    {MODEL_LABELS[m] ?? m}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="row">
            <button
              className="btn primary small"
              disabled={!apiKey.trim() || save.isPending}
              onClick={() => save.mutate({ apiKey: apiKey.trim() })}
            >
              Key speichern
            </button>
            {st.source === 'admin' && (
              <button
                className="btn small danger"
                disabled={remove.isPending}
                onClick={() =>
                  confirm(
                    'Gespeicherten Key entfernen? Die Übersetzung ist danach abgeschaltet.',
                  ) && remove.mutate(undefined)
                }
              >
                Key entfernen
              </button>
            )}
          </div>
        </>
      ) : (
        !isAdmin && <p className="muted small">Nur Administratoren dürfen den Key ändern.</p>
      )}
    </div>
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
