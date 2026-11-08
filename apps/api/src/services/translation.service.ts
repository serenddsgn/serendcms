import Anthropic from '@anthropic-ai/sdk';
import type { Locale } from '@serend/schema';
import { AppError, errors } from '../lib/errors.js';
import { extractTexts } from '../lib/translate-content.js';
import type { IntegrationsService } from './integrations.service.js';

/** Das, was der Service vom SDK braucht; Tests geben eine Attrappe mit. */
export interface ClaudeClient {
  messages: {
    stream(params: Anthropic.MessageStreamParams): {
      finalMessage(): Promise<Pick<Anthropic.Message, 'content' | 'stop_reason'>>;
    };
  };
}
export type ClaudeFactory = (apiKey: string) => ClaudeClient;
export const defaultClaudeFactory: ClaudeFactory = (apiKey) =>
  new Anthropic({ apiKey, maxRetries: 2 }) as unknown as ClaudeClient;

const LANGUAGE: Record<Locale, string> = { de: 'Deutsch', en: 'Englisch' };

const SYSTEM = `Du übersetzt Texte für die Website des Designstudios „serend“ (serend.design): Webdesign, Shops, Branding, Print.
Der Ton ist direkt, ruhig und selbstbewusst, ohne Marketing-Floskeln. Übersetze sinngemäß und idiomatisch, nicht Wort für Wort, und halte Länge und Satzrhythmus der Vorlage ein (Überschriften bleiben kurz).
Regeln:
- Namen von Marken, Kunden, Projekten und Produkten sowie der Studioname „serend“ bleiben unübersetzt.
- Enthält ein Text Markierungen wie <r1>…</r1><r2>…</r2>, bleiben genau diese Markierungen in derselben Reihenfolge und Anzahl erhalten; übersetze nur den Text darin. Leerzeichen am Rand der Markierungen bleiben erhalten.
- Keine Erklärungen, keine Anmerkungen, nichts hinzufügen oder weglassen. Zahlen, URLs und E-Mail-Adressen unverändert lassen.
- Antworte ausschließlich im vorgegebenen JSON-Format; „id“ jedes Eintrags bleibt unverändert.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    translations: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'integer' }, text: { type: 'string' } },
        required: ['id', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['translations'],
  additionalProperties: false,
} as const;

const MAX_ITEMS_PER_REQUEST = 60;
const MAX_CHARS_PER_REQUEST = 8000;

function chunk(texts: string[]): number[][] {
  const batches: number[][] = [];
  let current: number[] = [];
  let chars = 0;
  texts.forEach((t, i) => {
    if (
      current.length > 0 &&
      (current.length >= MAX_ITEMS_PER_REQUEST || chars + t.length > MAX_CHARS_PER_REQUEST)
    ) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(i);
    chars += t.length;
  });
  if (current.length > 0) batches.push(current);
  return batches;
}

export function createTranslationService({
  integrations,
  claude = defaultClaudeFactory,
}: {
  integrations: IntegrationsService;
  claude?: ClaudeFactory;
}) {
  async function translateTexts(
    client: ClaudeClient,
    model: string,
    texts: string[],
    from: Locale,
    to: Locale,
  ): Promise<string[]> {
    const out = new Array<string>(texts.length);
    for (const batch of chunk(texts)) {
      const message = await client.messages
        .stream({
          model,
          max_tokens: 32_000,
          system: SYSTEM,
          // Übersetzen braucht kaum Nachdenken: niedriger Aufwand spart Zeit und Kosten.
          output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
          messages: [
            {
              role: 'user',
              content: `Übersetze von ${LANGUAGE[from]} nach ${LANGUAGE[to]}.\n\n${JSON.stringify({
                items: batch.map((i) => ({ id: i, text: texts[i] })),
              })}`,
            },
          ],
        })
        .finalMessage();
      if (message.stop_reason === 'refusal')
        throw new AppError(502, 'internal_error', 'Das Modell hat die Übersetzung abgelehnt.');
      if (message.stop_reason === 'max_tokens')
        throw new AppError(
          502,
          'internal_error',
          'Die Übersetzung wurde abgeschnitten. Bitte die Seite in kleineren Teilen übersetzen.',
        );
      const text = message.content.find((b) => b.type === 'text');
      let parsed: { translations?: { id: number; text: string }[] };
      try {
        parsed = JSON.parse(text && 'text' in text ? text.text : '');
      } catch {
        throw new AppError(
          502,
          'internal_error',
          'Die Antwort des Übersetzungsdienstes war unlesbar.',
        );
      }
      for (const t of parsed.translations ?? []) if (batch.includes(t.id)) out[t.id] = t.text;
      if (batch.some((i) => out[i] === undefined))
        throw new AppError(
          502,
          'internal_error',
          'Die Übersetzung war unvollständig. Bitte erneut versuchen.',
        );
    }
    return out;
  }

  return {
    /**
     * Übersetzt alle Textfelder von `tree` und gibt eine übersetzte Kopie zurück; gespeichert wird nichts.
     * Läufe mit Formatierung gehen mit Markierungen als Ganzes durch, damit der Satz im Zusammenhang übersetzt wird.
     */
    async translate<T>(tree: T, from: Locale, to: Locale): Promise<{ result: T; model: string }> {
      const creds = await integrations.resolveAnthropic();
      if (!creds)
        throw errors.conflict(
          'Automatische Übersetzung ist nicht eingerichtet: Bitte unter Einstellungen einen Anthropic-Key hinterlegen.',
        );
      const client = claude(creds.apiKey);
      const { result, slots } = extractTexts(tree);
      try {
        if (slots.length > 0) {
          const translated = await translateTexts(
            client,
            creds.model,
            slots.map((s) => s.text),
            from,
            to,
          );
          // Kamen Lauf-Markierungen nicht zurück, werden die Läufe einzeln übersetzt (ohne Satzzusammenhang, aber ohne Verlust).
          const failed = slots.filter((s, i) => !s.apply(translated[i]!));
          if (failed.length > 0) {
            const runs = failed.flatMap((s) => s.runs());
            const again = await translateTexts(client, creds.model, runs, from, to);
            let pos = 0;
            for (const s of failed) {
              const n = s.runs().length;
              s.applyRuns(again.slice(pos, pos + n));
              pos += n;
            }
          }
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw mapAnthropicError(err);
      }
      return { result, model: creds.model };
    },
  };
}

function mapAnthropicError(err: unknown): AppError {
  if (
    err instanceof Anthropic.AuthenticationError ||
    err instanceof Anthropic.PermissionDeniedError
  )
    return new AppError(
      400,
      'bad_request',
      'Der Anthropic-Key wurde abgelehnt. Bitte unter Einstellungen prüfen.',
    );
  if (err instanceof Anthropic.RateLimitError)
    return new AppError(
      429,
      'rate_limited',
      'Das Anthropic-Limit ist erreicht. Bitte später erneut versuchen.',
    );
  if (err instanceof Anthropic.BadRequestError)
    return new AppError(
      502,
      'internal_error',
      'Anthropic hat die Anfrage abgelehnt (Guthaben aufgebraucht oder Modell nicht verfügbar?).',
    );
  return new AppError(502, 'internal_error', 'Der Übersetzungsdienst ist gerade nicht erreichbar.');
}

export type TranslationService = ReturnType<typeof createTranslationService>;
