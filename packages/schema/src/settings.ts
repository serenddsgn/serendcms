import { z } from 'zod';
import { LinkTarget } from './blocks.js';

/** Einstellungen: key + JSONB value je Sprache, pro Key per Zod validiert. */
export const SETTING_SCHEMAS = {
  'site.identity': z.object({
    name: z.string().min(1).max(80),
    city: z.string().min(1).max(80),
    email: z.email(),
  }),
  'site.cta': z.object({ label: z.string().min(1).max(60), target: LinkTarget }),
  'site.footer': z.object({
    madeWith: z.string().min(1).max(120),
    copyright: z.string().min(1).max(120),
  }),
  'seo.defaults': z.object({
    siteName: z.string().min(1).max(80),
    description: z.string().min(1).max(300),
  }),
  organization: z.object({
    legalName: z.string().min(1).max(120),
    description: z.string().max(300).optional(),
  }),
} as const;

export const SETTING_KEYS = Object.keys(SETTING_SCHEMAS) as SettingKey[];
export type SettingKey = keyof typeof SETTING_SCHEMAS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTING_SCHEMAS)[K]>;
export const SettingKeySchema = z.enum(
  Object.keys(SETTING_SCHEMAS) as [SettingKey, ...SettingKey[]],
);

export function parseSetting<K extends SettingKey>(key: K, value: unknown): SettingValue<K> {
  return SETTING_SCHEMAS[key].parse(value) as SettingValue<K>;
}
