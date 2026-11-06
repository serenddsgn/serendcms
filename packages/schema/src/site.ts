import { z } from 'zod';
import { Email } from './auth.js';
import { Locale, Slug, Uuid } from './common.js';
import { Category, Status } from './projects.js';
import { SettingKeySchema } from './settings.js';

// ── Leistungen ────────────────────────────────────────────────────────
export const ServiceDto = z.object({
  id: Uuid,
  locale: Locale,
  translationGroupId: Uuid,
  key: Category,
  name: z.string(),
  description: z.string(),
  sortOrder: z.number().int(),
  status: Status,
});
export const ServiceBody = z.object({
  locale: Locale,
  translationGroupId: Uuid.optional(),
  key: Category,
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(300),
  sortOrder: z.number().int().min(0).max(999).default(0),
  status: Status.default('draft'),
});
export const ServiceUpdateBody = ServiceBody.omit({
  locale: true,
  translationGroupId: true,
  key: true,
}).partial();

// ── Navigation ────────────────────────────────────────────────────────
export const NAV_LOCATIONS = ['header', 'footer', 'legal'] as const;
export const NavTarget = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('page'), pageId: Uuid, fragment: Slug.nullable().default(null) }),
  z.object({ kind: z.literal('url'), url: z.url({ protocol: /^(https?|mailto|tel)$/ }) }),
]);
export const NavItemDto = z.object({
  id: Uuid,
  locale: Locale,
  location: z.enum(NAV_LOCATIONS),
  label: z.string(),
  target: NavTarget,
  sortOrder: z.number().int(),
  status: Status,
});
export const NavItemBody = z.object({
  locale: Locale,
  location: z.enum(NAV_LOCATIONS),
  label: z.string().trim().min(1).max(60),
  target: NavTarget,
  sortOrder: z.number().int().min(0).max(999).default(0),
  status: Status.default('draft'),
});
export const NavItemUpdateBody = NavItemBody.omit({ locale: true }).partial();

// ── Team (im Design noch nicht vorgesehen, daher nur Datenpflege) ─────
export const TeamMemberDto = z.object({
  id: Uuid,
  locale: Locale,
  translationGroupId: Uuid,
  name: z.string(),
  roleTitle: z.string(),
  bio: z.string().nullable(),
  photoMediaId: Uuid.nullable(),
  sortOrder: z.number().int(),
  status: Status,
});
export const TeamMemberBody = z.object({
  locale: Locale,
  translationGroupId: Uuid.optional(),
  name: z.string().trim().min(1).max(100),
  roleTitle: z.string().trim().min(1).max(100),
  bio: z.string().trim().max(1500).nullable().default(null),
  photoMediaId: Uuid.nullable().default(null),
  sortOrder: z.number().int().min(0).max(999).default(0),
  status: Status.default('draft'),
});
export const TeamMemberUpdateBody = TeamMemberBody.omit({
  locale: true,
  translationGroupId: true,
}).partial();

export const OrderIdsBody = z.object({ ids: z.array(Uuid).min(1).max(200) });
export const IdParams = z.object({ id: Uuid });
export const LocaleQuery = z.object({ locale: Locale.optional() });

// ── Einstellungen ─────────────────────────────────────────────────────
export const SettingDto = z.object({
  key: SettingKeySchema,
  locale: Locale,
  value: z.unknown(),
  updatedAt: z.iso.datetime(),
});
export const SettingParams = z.object({ key: SettingKeySchema });
export const SettingQuery = z.object({ locale: Locale });
export const SettingBody = z.object({ value: z.unknown() });

// ── Kontakt ───────────────────────────────────────────────────────────
export const CONTACT_STATUSES = ['new', 'read', 'spam', 'archived'] as const;
export const ContactBody = z.object({
  name: z.string().trim().min(1).max(100),
  email: Email,
  message: z.string().trim().min(1).max(5000),
  locale: Locale,
  /** Einwilligung zur Verarbeitung (Datenschutzerklärung). */
  consent: z.literal(true),
  /** Honeypot: echte Besucher lassen das Feld leer (es ist per CSS versteckt). */
  website: z.string().max(200).optional(),
});
export const ContactMessageDto = z.object({
  id: Uuid,
  locale: Locale,
  name: z.string(),
  email: z.string(),
  message: z.string(),
  status: z.enum(CONTACT_STATUSES),
  createdAt: z.iso.datetime(),
});
export const ContactStatusBody = z.object({ status: z.enum(CONTACT_STATUSES) });

// ── Vorschau ──────────────────────────────────────────────────────────
export const PreviewLinkResponse = z.object({ url: z.string(), expiresAt: z.iso.datetime() });
