import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../api';
import { Notice, errText, useAction } from '../ui';

interface Item {
  id: string;
  locale: string;
  translationGroupId: string;
  title: string;
  slug: string;
  systemKey?: string | null;
}

const LANG: Record<string, string> = { de: 'Deutsch', en: 'Englisch' };

/**
 * Sprachversion: zeigt das verknüpfte Gegenstück oder bietet an, eine Kopie anzulegen bzw. eine bereits
 * vorhandene Version der anderen Sprache zu verknüpfen. Ohne Verknüpfung weiß der Sprachumschalter der Website
 * nicht, welche DE-Seite zu welcher EN-Seite gehört.
 */
export function TranslationPanel({
  kind,
  id,
  locale,
  groupId,
  systemKey = null,
  onCopy,
  copying,
}: {
  kind: 'pages' | 'projects';
  id: string;
  locale: string;
  groupId: string;
  systemKey?: string | null;
  onCopy: (locale: string) => void;
  copying: boolean;
}) {
  const other = locale === 'de' ? 'en' : 'de';
  const route = kind === 'pages' ? 'pages' : 'projects';
  const mine = useQuery({
    queryKey: [kind, locale],
    queryFn: () => api.get<Record<string, Item[]>>(`/${kind}?locale=${locale}`),
  });
  const theirs = useQuery({
    queryKey: [kind, other],
    queryFn: () => api.get<Record<string, Item[]>>(`/${kind}?locale=${other}`),
  });
  const [pick, setPick] = useState('');
  const link = useAction(
    (targetId: string) => api.put(`/${kind}/${id}/translation-link`, { targetId }),
    [[kind]],
    () => setPick(''),
  );
  const unlink = useAction(() => api.del(`/${kind}/${id}/translation-link`), [[kind]]);

  const otherItems = theirs.data?.[kind] ?? [];
  const counterpart = otherItems.find((x) => x.translationGroupId === groupId);
  // Kandidaten: Versionen der anderen Sprache, die noch zu keiner Version in dieser Sprache gehören
  const groupsHere = new Set((mine.data?.[kind] ?? []).map((x) => x.translationGroupId));
  const candidates = otherItems.filter(
    (x) => !groupsHere.has(x.translationGroupId) && (x.systemKey ?? null) === systemKey,
  );
  const err = link.error ?? unlink.error;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Sprachversion {LANG[other]}</h2>
      {err && <Notice>{errText(err)}</Notice>}
      {theirs.isLoading || mine.isLoading ? (
        <p className="muted small">Lädt …</p>
      ) : counterpart ? (
        <div className="row between">
          <span>
            Verknüpft mit <Link to={`/${route}/${counterpart.id}`}>{counterpart.title}</Link>{' '}
            <span className="muted small">
              ({other.toUpperCase()} · /{counterpart.slug})
            </span>
          </span>
          <button
            className="btn"
            disabled={unlink.isPending}
            onClick={() =>
              confirm(
                'Verknüpfung lösen? Der Sprachumschalter findet das Gegenstück dann nicht mehr. Beide Einträge bleiben bestehen.',
              ) && unlink.mutate(undefined)
            }
          >
            Verknüpfung lösen
          </button>
        </div>
      ) : (
        <>
          <p className="muted small">
            Noch keine {LANG[other]}e Version verknüpft: Der Sprachumschalter führt hier zur
            Startseite der anderen Sprache.
          </p>
          <div className="row">
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              aria-label="Vorhandene Version verknüpfen"
            >
              <option value="">Vorhandene {other.toUpperCase()}-Version wählen …</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} (/{c.slug})
                </option>
              ))}
            </select>
            <button
              className="btn primary"
              disabled={!pick || link.isPending}
              onClick={() => link.mutate(pick)}
            >
              Verknüpfen
            </button>
            <span className="muted small">oder</span>
            <button className="btn" disabled={copying} onClick={() => onCopy(other)}>
              Kopie als {other.toUpperCase()}-Version anlegen
            </button>
          </div>
        </>
      )}
    </div>
  );
}
