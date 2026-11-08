import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

export interface AnthropicStatus {
  configured: boolean;
  source: 'env' | 'admin' | null;
  last4: string | null;
  model: string;
  models: string[];
  canStoreKey: boolean;
}

export const anthropicKey = ['integrations', 'anthropic'];

export function useAnthropicStatus() {
  return useQuery({
    queryKey: anthropicKey,
    queryFn: () => api.get<{ anthropic: AnthropicStatus }>('/integrations/anthropic'),
  });
}

const LANG: Record<string, string> = { de: 'Deutsch', en: 'Englisch' };

/**
 * Button „Automatisch übersetzen“. Erscheint erst, wenn ein Anthropic-Key hinterlegt ist. Übersetzt, was der Editor zeigt,
 * aus der jeweils anderen Sprache in die Sprache der Seite; gespeichert wird erst mit „Entwurf speichern“.
 */
export function AutoTranslateButton({
  kind,
  locale,
  groupId,
  pending,
  onConfirm,
}: {
  kind: 'pages' | 'projects';
  locale: string;
  /** Übersetzungsgruppe: Der Button erscheint nur, wenn es die Gegenversion in der anderen Sprache gibt. */
  groupId: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  const to = locale;
  const from = locale === 'de' ? 'en' : 'de';
  const status = useAnthropicStatus();
  const configured = !!status.data?.anthropic.configured;
  const counterpart = useQuery({
    queryKey: [kind, from],
    enabled: configured,
    queryFn: () =>
      api.get<Record<string, { translationGroupId: string }[]>>(`/${kind}?locale=${from}`),
  });
  const exists = counterpart.data?.[kind]?.some((x) => x.translationGroupId === groupId);
  if (!configured || !exists) return null;
  return (
    <button
      className="btn"
      disabled={pending}
      title="Übersetzt den Inhalt maschinell mit Claude. Das Ergebnis ist ein Vorschlag und wird erst mit „Entwurf speichern“ übernommen."
      onClick={() =>
        confirm(
          `Der Inhalt im Editor wird als ${LANG[from]} gelesen und maschinell nach ${LANG[to]} übersetzt. ` +
            'Der aktuelle Inhalt im Editor wird dabei ersetzt, gespeichert wird noch nichts. Fortfahren?',
        ) && onConfirm()
      }
    >
      {pending ? 'Übersetzt …' : `Automatisch nach ${to.toUpperCase()} übersetzen`}
    </button>
  );
}

export const autoTranslateNotice = (model: string) =>
  `Maschinell übersetzt (${model}). Noch nicht gespeichert: bitte prüfen, dann „Entwurf speichern“.`;
