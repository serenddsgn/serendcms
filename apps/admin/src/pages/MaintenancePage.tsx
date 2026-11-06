import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { MaintenanceDto } from '@serend/schema';
import { api } from '../api';
import { MediaField } from '../components/MediaPicker';
import { useSession } from '../session';
import { Field, Notice, errText, fmtDate, useAction } from '../ui';

export function MaintenancePage() {
  const { user } = useSession();
  const isAdmin = user.role === 'admin';
  const q = useQuery({
    queryKey: ['maintenance'],
    queryFn: () => api.get<{ maintenance: MaintenanceDto }>('/maintenance'),
  });
  const [form, setForm] = useState<Omit<MaintenanceDto, 'updatedAt'> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (q.data) {
      const { updatedAt: _u, ...rest } = q.data.maintenance;
      setForm(rest);
    }
  }, [q.data]);
  const save = useAction(
    (v: Omit<MaintenanceDto, 'updatedAt'>) => api.put('/maintenance', v),
    [['maintenance']],
    () => setMsg('Gespeichert. Die Änderung ist sofort aktiv.'),
  );
  const pass = useAction(
    () => api.post<{ url: string }>('/maintenance/pass'),
    [],
    (r) => window.open(r.url, '_blank', 'noopener'),
  );
  if (q.error) return <Notice>{errText(q.error)}</Notice>;
  if (!q.data || !form) return <p className="muted">Lädt …</p>;
  const on = q.data.maintenance.enabled;
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });
  return (
    <>
      <div className="row between">
        <div>
          <h1>Wartungsmodus</h1>
          <p className="muted">
            Besucher sehen eine Wartungsseite, die echte Seite sehen nur du und deine Kollegen über
            den Link unten. Das Umschalten wirkt sofort, ein Build ist nicht nötig.
          </p>
        </div>
        <span
          className={`pill ${on ? 'failed' : 'published'}`}
          style={{ fontSize: 14, padding: '6px 16px' }}
        >
          {on ? 'AN: Besucher sehen die Wartungsseite' : 'AUS: Seite ist öffentlich'}
        </span>
      </div>
      {(save.error || pass.error) && <Notice>{errText(save.error ?? pass.error)}</Notice>}
      {msg && !save.error && <Notice kind="ok">{msg}</Notice>}
      {!isAdmin && (
        <Notice kind="info">Nur Administratoren dürfen den Wartungsmodus ändern.</Notice>
      )}
      <div className="card">
        <label className="row" style={{ fontSize: 17 }}>
          <input
            type="checkbox"
            checked={form.enabled}
            disabled={!isAdmin}
            onChange={(e) => set({ enabled: e.target.checked })}
          />
          <strong>Wartungsmodus aktivieren</strong>
        </label>
        <p className="muted small">
          Gespeichert wird mit dem Knopf unten. Die Wartungsseite wird mit Status 503 ausgeliefert
          (Suchmaschinen merken sich nichts Falsches) und ist nicht indexierbar.
        </p>
      </div>
      <h2>Inhalt der Wartungsseite</h2>
      <div className="card">
        <Field label="Überschrift Deutsch  ·  [[Wort]] bekommt den Liquid-Verlauf">
          <input
            disabled={!isAdmin}
            value={form.headlineDe}
            onChange={(e) => set({ headlineDe: e.target.value })}
          />
        </Field>
        <Field label="Zeile Englisch">
          <input
            disabled={!isAdmin}
            value={form.headlineEn}
            onChange={(e) => set({ headlineEn: e.target.value })}
          />
        </Field>
        <MediaField
          label="Logo (PNG, WebP, JPEG oder AVIF; ohne Logo erscheint die Wortmarke)"
          value={form.logoMediaId}
          onChange={(v) => isAdmin && set({ logoMediaId: v })}
        />
        {isAdmin && (
          <button
            className="btn primary"
            disabled={save.isPending}
            onClick={() => save.mutate(form)}
          >
            Speichern
          </button>
        )}
        <span className="muted small" style={{ marginLeft: 12 }}>
          Zuletzt geändert: {fmtDate(q.data.maintenance.updatedAt)}
        </span>
      </div>
      <h2>Die echte Seite ansehen</h2>
      <div className="card">
        <p>
          Der Link schaltet die öffentliche Seite für <strong>diesen Browser</strong> für 8 Stunden
          frei (Cookie). Er ist nur 5 Minuten gültig und nur für angemeldete Redakteure verfügbar.
        </p>
        <button className="btn" disabled={pass.isPending} onClick={() => pass.mutate(undefined)}>
          Seite als Redakteur ansehen
        </button>
      </div>
    </>
  );
}

/** Rote Leiste in jeder Admin-Ansicht, solange der Wartungsmodus an ist. */
export function MaintenanceBar() {
  const q = useQuery({
    queryKey: ['maintenance'],
    queryFn: () => api.get<{ maintenance: MaintenanceDto }>('/maintenance'),
    refetchInterval: 30_000,
  });
  if (!q.data?.maintenance.enabled) return null;
  return (
    <div
      role="status"
      style={{ background: 'var(--danger)', color: '#fff', padding: '8px 36px', fontSize: 14 }}
    >
      Wartungsmodus ist AN: Besucher sehen nur die Wartungsseite.{' '}
      <a href="/maintenance" style={{ color: '#fff', fontWeight: 600 }}>
        Verwalten
      </a>
    </div>
  );
}
