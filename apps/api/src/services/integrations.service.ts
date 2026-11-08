import type { Database } from '@serend/db';
import {
  DEFAULT_TRANSLATION_MODEL,
  TRANSLATION_MODELS,
  TranslationModel,
  type AnthropicStatus,
} from '@serend/schema';
import type { AppConfig } from '../config.js';
import { errors } from '../lib/errors.js';
import { createSecretBox } from '../lib/secret-box.js';
import { integrationsRepo } from '../repositories/integrations.repo.js';

const ANTHROPIC = 'anthropic';

/**
 * Zugangsdaten externer Dienste. Der Key aus der Umgebung hat Vorrang; sonst gilt der verschlüsselt gespeicherte.
 * Klartext verlässt diesen Service nur in `resolveAnthropic()` (für den API-Aufruf), nie über die HTTP-Schnittstelle.
 */
export function createIntegrationsService({
  db,
  config,
}: {
  db: Database;
  config: Pick<AppConfig, 'secretsKey' | 'anthropicApiKey'>;
}) {
  const box = config.secretsKey ? createSecretBox(config.secretsKey) : undefined;
  const modelOf = (options: Record<string, unknown> | undefined) => {
    const parsed = TranslationModel.safeParse(options?.model);
    return parsed.success ? parsed.data : DEFAULT_TRANSLATION_MODEL;
  };
  // Ein nicht entschlüsselbarer Eintrag (SECRETS_ENCRYPTION_KEY gewechselt) gilt als nicht hinterlegt.
  const storedKey = (row: { ciphertext: string } | undefined): string | null => {
    if (!row || !row.ciphertext || !box) return null;
    try {
      return box.open(ANTHROPIC, row.ciphertext);
    } catch {
      return null;
    }
  };

  return {
    async status(): Promise<AnthropicStatus> {
      const row = await integrationsRepo(db).find(ANTHROPIC);
      const stored = storedKey(row) !== null;
      const source = config.anthropicApiKey ? 'env' : stored ? 'admin' : null;
      return {
        configured: source !== null,
        source,
        last4: stored && row ? row.last4 : null,
        model: modelOf(row?.options),
        models: [...TRANSLATION_MODELS],
        canStoreKey: box !== undefined,
      };
    },

    async saveAnthropic(
      actorId: string,
      body: { apiKey?: string | undefined; model?: string | undefined },
    ) {
      const repo = integrationsRepo(db);
      const current = await repo.find(ANTHROPIC);
      if (body.apiKey !== undefined && !box)
        throw errors.conflict(
          'Der Key kann nicht gespeichert werden: SECRETS_ENCRYPTION_KEY ist nicht gesetzt. Alternativ ANTHROPIC_API_KEY in der Umgebung setzen.',
        );
      await repo.upsert(ANTHROPIC, {
        ...(body.apiKey !== undefined && {
          ciphertext: box!.seal(ANTHROPIC, body.apiKey),
          last4: body.apiKey.slice(-4),
        }),
        ...(body.model !== undefined && {
          options: { ...current?.options, model: modelOf({ model: body.model }) },
        }),
        updatedBy: actorId,
      });
      return this.status();
    },

    /** Entfernt den gespeicherten Key (das Modell bleibt). Ein Key aus der Umgebung bleibt unberührt. */
    async removeAnthropicKey(actorId: string) {
      const repo = integrationsRepo(db);
      const current = await repo.find(ANTHROPIC);
      if (current) await repo.upsert(ANTHROPIC, { ciphertext: '', last4: '', updatedBy: actorId });
      return this.status();
    },

    /** Key und Modell für einen API-Aufruf; `null`, wenn nichts hinterlegt ist. */
    async resolveAnthropic(): Promise<{ apiKey: string; model: TranslationModel } | null> {
      const row = await integrationsRepo(db).find(ANTHROPIC);
      const apiKey = config.anthropicApiKey ?? storedKey(row);
      return apiKey ? { apiKey, model: modelOf(row?.options) } : null;
    },
  };
}

export type IntegrationsService = ReturnType<typeof createIntegrationsService>;
