import { useQuery } from '@tanstack/react-query';
import type { BuildWarningDto } from '@serend/schema';
import { api } from './api';

const norm = (p: string) => (p.endsWith('/') ? p : `${p}/`);

/**
 * Warnungen des Builds, der gerade live ist (z. B. Performance unter dem Ziel). Sie verhindern keinen Build; Listen
 * markieren damit ihre Einträge. Das Ergebnis ist eine Funktion: Pfade der Seite übergeben, passende Warnungen zurück.
 */
export function useLiveWarnings() {
  const q = useQuery({
    queryKey: ['status'],
    queryFn: () => api.get<{ warnings?: BuildWarningDto[] }>('/status'),
    refetchInterval: 30_000,
  });
  const list = q.data?.warnings ?? [];
  return (paths: string[]) => {
    const wanted = new Set(paths.map(norm));
    return list.filter((w) => w.path !== null && wanted.has(norm(w.path)));
  };
}

/** Kleines Warn-Badge; der Tooltip nennt die Details. */
export function WarnBadge({ warnings }: { warnings: BuildWarningDto[] }) {
  if (warnings.length === 0) return null;
  const score = /Performance (\d+)/.exec(warnings[0]!.message)?.[1];
  return (
    <span
      className="pill warn"
      title={`${warnings.map((w) => w.message).join('\n')}\n\nDer Build wurde trotzdem veröffentlicht.`}
    >
      ⚠ {score ? `Performance ${score}` : 'Warnung'}
    </span>
  );
}
