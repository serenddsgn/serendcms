import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IMPORT_EXAMPLE, buildImport } from '@serend/schema';
import {
  as,
  createMedia,
  createTestApp,
  editorSession,
  type Session,
  type TestApp,
} from './helpers.js';

let t: TestApp;
let ed: Session;
beforeAll(async () => {
  t = await createTestApp();
  ed = await editorSession(t, 'editor');
});
afterAll(() => t.close());

/** Bild-Import wie im Admin: Medien über den Dateinamen finden, Einträge der Reihe nach anlegen, Gruppen verknüpfen. */
describe('Import-Datei → API', () => {
  it('legt Projekte (mit Sprachversion) und Seiten als Entwürfe an', async () => {
    const ids = await Promise.all([createMedia(t, ed), createMedia(t, ed), createMedia(t, ed)]);
    const names = [
      'beispiel-werkstatt-cover.jpg',
      'beispiel-werkstatt-1.jpg',
      'beispiel-werkstatt-2.jpg',
    ];
    const plan = buildImport(IMPORT_EXAMPLE, {
      media: ids.map((id, i) => ({ id, filename: names[i]! })),
    });
    expect(plan.errors).toEqual([]);

    const groups = new Map<string, string>();
    const created: { kind: string; status: string; locale: string; group: string }[] = [];
    for (const item of plan.items) {
      const gid = item.group ? groups.get(item.group) : undefined;
      const body = { ...item.body, ...(gid ? { translationGroupId: gid } : {}) };
      const res = await as(
        t,
        ed,
        'POST',
        item.kind === 'project' ? '/api/v1/projects' : '/api/v1/pages',
        body,
      );
      expect(res.statusCode, res.body).toBe(201);
      const row = res.json()[item.kind === 'project' ? 'project' : 'page'];
      if (item.group && !gid) groups.set(item.group, row.translationGroupId);
      created.push({
        kind: item.kind,
        status: row.status,
        locale: row.locale,
        group: row.translationGroupId,
      });
    }
    expect(created.every((c) => c.status === 'draft')).toBe(true);
    // Deutsche und englische Fassung teilen sich eine Gruppe
    expect(created[0]!.group).toBe(created[1]!.group);
    expect(created[2]!.group).not.toBe(created[0]!.group);
  });
});
