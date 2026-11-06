import { z } from 'zod';
import { Uuid } from './common.js';

export const MaintenanceDto = z.object({
  enabled: z.boolean(),
  headlineDe: z.string(),
  headlineEn: z.string(),
  logoMediaId: Uuid.nullable(),
  updatedAt: z.iso.datetime(),
});
export type MaintenanceDto = z.infer<typeof MaintenanceDto>;

/** Überschrift in der Inline-Schreibweise: [[Schlüsselwort]] bekommt den Liquid-Verlauf. */
const Headline = z.string().trim().min(1).max(120);
export const MaintenanceBody = z.object({
  enabled: z.boolean(),
  headlineDe: Headline,
  headlineEn: Headline,
  logoMediaId: Uuid.nullable(),
});
export const MaintenanceResponse = z.object({ maintenance: MaintenanceDto });
export const MaintenancePassResponse = z.object({ url: z.string(), expiresAt: z.iso.datetime() });
export const MaintenanceEnterQuery = z.object({ token: z.string().min(10).max(2000) });
