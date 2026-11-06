import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { ApiError } from './api';

export const errText = (e: unknown) =>
  e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Unbekannter Fehler';

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="lbl">{label}</span>
      {children}
      {error && (
        <div className="err" role="alert">
          {error}
        </div>
      )}
    </label>
  );
}

export function Notice({
  kind = 'error',
  children,
}: {
  kind?: 'error' | 'ok' | 'info';
  children: ReactNode;
}) {
  return (
    <div className={`notice ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export const Pill = ({ value }: { value: string }) => (
  <span className={`pill ${value}`}>{value}</span>
);

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="box" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="btn small" onClick={onClose}>
            Schließen
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Mutation mit Fehleranzeige und Cache-Aktualisierung. */
export function useAction<V, R>(
  fn: (v: V) => Promise<R>,
  invalidate: QueryKey[] = [],
  onDone?: (r: R) => void,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (r) => {
      await Promise.all(invalidate.map((k) => qc.invalidateQueries({ queryKey: k })));
      onDone?.(r);
    },
  });
}

export function useLocale() {
  const [locale, setLocale] = useState<'de' | 'en'>(
    () => (localStorage.getItem('admin-locale') as 'de' | 'en') ?? 'de',
  );
  const set = (l: 'de' | 'en') => {
    localStorage.setItem('admin-locale', l);
    setLocale(l);
  };
  return [locale, set] as const;
}

export function LocaleSwitch({
  value,
  onChange,
}: {
  value: 'de' | 'en';
  onChange: (l: 'de' | 'en') => void;
}) {
  return (
    <div className="row" role="group" aria-label="Sprache">
      {(['de', 'en'] as const).map((l) => (
        <button
          key={l}
          className={`btn small ${value === l ? 'primary' : ''}`}
          onClick={() => onChange(l)}
          aria-pressed={value === l}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–';
