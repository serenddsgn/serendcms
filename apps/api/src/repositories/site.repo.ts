import { and, asc, eq, sql } from 'drizzle-orm';
import {
  navigationItems,
  services,
  siteSettings,
  type NavigationItemRow,
  type ServiceRow,
  type SiteSettingRow,
} from '@serend/db';
import type { Executor } from './executor.js';

export function siteRepo(x: Executor) {
  return {
    async insertService(values: typeof services.$inferInsert): Promise<ServiceRow> {
      const [row] = await x.insert(services).values(values).returning();
      if (!row) throw new Error('insert service returned no row');
      return row;
    },
    async listServices(filter: { locale?: string; status?: string } = {}): Promise<ServiceRow[]> {
      return x
        .select()
        .from(services)
        .where(
          and(
            filter.locale ? eq(services.locale, filter.locale) : undefined,
            filter.status ? eq(services.status, filter.status) : undefined,
          ),
        )
        .orderBy(asc(services.locale), asc(services.sortOrder), asc(services.id));
    },
    async insertNavigationItem(
      values: typeof navigationItems.$inferInsert,
    ): Promise<NavigationItemRow> {
      const [row] = await x.insert(navigationItems).values(values).returning();
      if (!row) throw new Error('insert navigation item returned no row');
      return row;
    },
    async upsertSetting(
      key: string,
      locale: string,
      value: unknown,
      mediaId: string | null = null,
    ): Promise<SiteSettingRow> {
      const [row] = await x
        .insert(siteSettings)
        .values({ key, locale, value, mediaId })
        .onConflictDoUpdate({
          target: [siteSettings.key, siteSettings.locale],
          set: { value, mediaId, updatedAt: sql`now()` },
        })
        .returning();
      if (!row) throw new Error('upsert setting returned no row');
      return row;
    },
    async listSettings(): Promise<SiteSettingRow[]> {
      return x.select().from(siteSettings).orderBy(asc(siteSettings.key), asc(siteSettings.locale));
    },
  };
}
