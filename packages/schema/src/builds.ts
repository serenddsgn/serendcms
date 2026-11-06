import { z } from 'zod';
import { Uuid } from './common.js';

export const BUILD_STATUSES = ['queued', 'running', 'succeeded', 'failed'] as const;
export const BuildStatus = z.enum(BUILD_STATUSES);

export const BuildSummaryDto = z.object({
  id: Uuid,
  status: BuildStatus,
  trigger: z.enum(['publish', 'manual', 'deploy', 'settings']),
  requestedAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  errorSummary: z.string().nullable(),
  releaseId: Uuid.nullable(),
});
export type BuildSummaryDto = z.infer<typeof BuildSummaryDto>;

export const BuildDetailDto = BuildSummaryDto.extend({
  log: z.string().nullable(),
  /** Prüfergebnisse (Links, HTML, JS-Budget, Lighthouse); Form siehe @serend/builder. */
  checks: z.unknown().nullable(),
});

export const ReleaseDto = z.object({
  id: Uuid,
  buildId: Uuid,
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
  activatedAt: z.iso.datetime().nullable(),
  /** Kein Rollback mehr möglich, wenn die Dateien aufgeräumt wurden. */
  removed: z.boolean(),
});

export type ReleaseDto = z.infer<typeof ReleaseDto>;

export const StatusResponse = z.object({
  activeRelease: ReleaseDto.nullable(),
  lastBuild: BuildSummaryDto.nullable(),
  buildQueued: z.boolean(),
  buildRunning: z.boolean(),
  /** Veröffentlichte Inhalte mit neueren, noch nicht freigegebenen Revisionen. */
  pending: z.object({ projects: z.number().int(), pages: z.number().int() }),
});

export const BuildListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export const BuildIdParams = z.object({ id: Uuid });
export const BuildListResponse = z.object({ builds: z.array(BuildSummaryDto) });
export const BuildDetailResponse = z.object({ build: BuildDetailDto });
export const BuildCreatedResponse = z.object({ build: BuildSummaryDto, created: z.boolean() });
export const ReleaseListResponse = z.object({ releases: z.array(ReleaseDto) });
export const ReleaseIdParams = z.object({ id: Uuid });
