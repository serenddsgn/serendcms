import { z } from 'zod';

/** Modelle für die automatische Übersetzung (Standard: das stärkste, die kleineren sind schneller und billiger). */
export const TRANSLATION_MODELS = [
  'claude-opus-5-5',
  'claude-sonnet-5-5',
  'claude-haiku-5-5',
] as const;
export const TranslationModel = z.enum(TRANSLATION_MODELS);
export type TranslationModel = z.infer<typeof TranslationModel>;
export const DEFAULT_TRANSLATION_MODEL: TranslationModel = 'claude-opus-5-5';

export const AnthropicStatus = z.object({
  /** Ein Key ist vorhanden (Umgebung oder Admin): Der Übersetzen-Button wird freigeschaltet. */
  configured: z.boolean(),
  source: z.enum(['env', 'admin']).nullable(),
  /** Letzte 4 Zeichen des im Admin hinterlegten Keys; der Key selbst verlässt den Server nie. */
  last4: z.string().nullable(),
  model: TranslationModel,
  models: z.array(TranslationModel),
  /** false, wenn SECRETS_ENCRYPTION_KEY fehlt: Der Key kann dann nur über die Umgebung gesetzt werden. */
  canStoreKey: z.boolean(),
});
export type AnthropicStatus = z.infer<typeof AnthropicStatus>;
export const AnthropicStatusResponse = z.object({ anthropic: AnthropicStatus });

export const SaveAnthropicBody = z
  .object({
    apiKey: z
      .string()
      .trim()
      .min(20)
      .max(300)
      .regex(/^sk-ant-/, 'Ein Anthropic-Key beginnt mit „sk-ant-“')
      .optional(),
    model: TranslationModel.optional(),
  })
  .refine((v) => v.apiKey !== undefined || v.model !== undefined, {
    message: 'Key oder Modell angeben',
  });

/**
 * Maschinelle Übersetzung als Vorschlag: übersetzt, was der Editor gerade zeigt (auch Ungespeichertes), und gibt es
 * zurück. Gespeichert wird nichts; der Editor übernimmt das Ergebnis in den Entwurf.
 */
const Inline = z.array(z.unknown()).min(1).max(20);
export const AutoTranslatePageBody = z.object({
  title: z.string().max(500),
  seoTitle: z.string().max(500).nullable().default(null),
  seoDescription: z.string().max(1000).nullable().default(null),
  content: z.array(z.unknown()).max(80),
});
export const AutoTranslatePageResponse = AutoTranslatePageBody.extend({ model: z.string() });
export const AutoTranslateProjectBody = z.object({
  title: z.string().max(500),
  subtitle: Inline.nullable().default(null),
  seoTitle: z.string().max(500).nullable().default(null),
  seoDescription: z.string().max(1000).nullable().default(null),
  content: z.array(z.unknown()).max(60),
});
export const AutoTranslateProjectResponse = AutoTranslateProjectBody.extend({ model: z.string() });
