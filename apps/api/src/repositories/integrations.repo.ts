import { eq, sql } from 'drizzle-orm';
import { integrationSecrets, type IntegrationSecretRow } from '@serend/db';
import type { Executor } from './executor.js';

export function integrationsRepo(x: Executor) {
  return {
    async find(name: string): Promise<IntegrationSecretRow | undefined> {
      const [row] = await x
        .select()
        .from(integrationSecrets)
        .where(eq(integrationSecrets.name, name))
        .limit(1);
      return row;
    },
    /** Legt den Eintrag an oder überschreibt nur die übergebenen Felder. */
    async upsert(
      name: string,
      values: {
        ciphertext?: string;
        last4?: string;
        options?: Record<string, unknown>;
        updatedBy: string;
      },
    ): Promise<void> {
      await x
        .insert(integrationSecrets)
        .values({
          name,
          ciphertext: values.ciphertext ?? '',
          last4: values.last4 ?? '',
          options: values.options ?? {},
          updatedBy: values.updatedBy,
        })
        .onConflictDoUpdate({
          target: integrationSecrets.name,
          set: {
            ...(values.ciphertext !== undefined && { ciphertext: values.ciphertext }),
            ...(values.last4 !== undefined && { last4: values.last4 }),
            ...(values.options !== undefined && { options: values.options }),
            updatedBy: values.updatedBy,
            updatedAt: sql`now()`,
          },
        });
    },
    async remove(name: string): Promise<void> {
      await x.delete(integrationSecrets).where(eq(integrationSecrets.name, name));
    },
  };
}
