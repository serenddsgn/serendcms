import { readdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  as,
  createMedia,
  createProject,
  draftBody,
  editorSession,
  expectError,
  imageBuffer,
  mp4Buffer,
  multipart,
  createTestApp,
  uploadImage,
  type Session,
  type TestApp,
} from './helpers.js';

let t: TestApp;
let ed: Session;
beforeAll(async () => {
  t = await createTestApp();
  ed = await editorSession(t);
});
afterAll(() => t.close());

describe('Upload und Validierung', () => {
  it.each(['jpeg', 'png', 'webp', 'avif'] as const)(
    'akzeptiert %s und erkennt den Typ per Magic Bytes',
    async (fmt) => {
      const res = await uploadImage(t, ed, {
        filename: `bild.${fmt}`,
        contentType: 'application/octet-stream',
        data: await imageBuffer(fmt, 48),
      });
      expect(res.statusCode).toBe(201);
      const m = res.json().media;
      expect(m.mime).toBe(fmt === 'jpeg' ? 'image/jpeg' : `image/${fmt}`);
      expect(m).toMatchObject({
        width: 48,
        height: 48,
        inUse: false,
        focalX: 50,
        focalY: 50,
        altText: {},
      });
    },
  );

  it('lehnt Nicht-Bilder trotz Bild-Dateiendung und Bild-MIME ab', async () => {
    const res = await uploadImage(t, ed, {
      filename: 'harmlos.jpg',
      contentType: 'image/jpeg',
      data: Buffer.from('<?php echo "pwned"; ?>'),
    });
    expectError(res, 415, 'unsupported_media_type');
  });

  it('lehnt SVG ab (XSS-Risiko)', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
    expectError(
      await uploadImage(t, ed, { filename: 'a.svg', contentType: 'image/svg+xml', data: svg }),
      415,
      'unsupported_media_type',
    );
  });

  it('lehnt Dateien mit gültiger Signatur, aber ohne dekodierbaren Inhalt ab', async () => {
    const fake = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('kein echtes png'),
    ]);
    expectError(await uploadImage(t, ed, { data: fake }), 415, 'unsupported_media_type');
  });

  it('lehnt Dateien über dem Größenlimit ab (413 im Einheitsformat)', async () => {
    const big = Buffer.concat([await imageBuffer('png'), Buffer.alloc(2 * 1024 * 1024)]);
    expectError(await uploadImage(t, ed, { data: big }), 413, 'payload_too_large');
  });

  it('verlangt eine Datei', async () => {
    const mp = multipart('x.png', 'image/png', Buffer.alloc(0));
    const body = Buffer.from(
      mp.payload.toString('latin1').replace('name="file"', 'name="other"'),
      'latin1',
    );
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/v1/media',
      payload: body,
      headers: { ...mp.headers, cookie: ed.cookie, 'x-csrf-token': ed.csrf },
    });
    expect([400, 415]).toContain(res.statusCode);
    expect(res.json().error.code).toBeDefined();
  });

  it('verlangt Anmeldung und CSRF-Token', async () => {
    const mp = multipart('a.png', 'image/png', await imageBuffer());
    const anon = await t.app.inject({
      method: 'POST',
      url: '/api/v1/media',
      payload: mp.payload,
      headers: mp.headers,
    });
    expectError(anon, 401, 'unauthenticated');
    const noCsrf = await t.app.inject({
      method: 'POST',
      url: '/api/v1/media',
      payload: mp.payload,
      headers: { ...mp.headers, cookie: ed.cookie },
    });
    expectError(noCsrf, 403, 'csrf_invalid');
  });

  it('übernimmt keine Pfade aus dem Dateinamen (Storage-Key serverseitig, Name bereinigt)', async () => {
    const res = await uploadImage(t, ed, {
      filename: '../../etc/passwd.png',
      data: await imageBuffer(),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().media.filename).toBe('passwd.png');
    const files = readdirSync(t.config.media.storageDir, { recursive: true }).map(String);
    expect(files.every((f) => !f.includes('passwd'))).toBe(true);
  });
});

/** Minimales WebM: EBML-Kopf + Segment/Tracks/TrackEntry/Video mit PixelWidth/PixelHeight. */
function webmBuffer(width: number, height: number): Buffer {
  const el = (id: number[], body: Buffer) =>
    Buffer.concat([Buffer.from(id), Buffer.from([0x80 | body.length]), body]);
  const u16 = (n: number) => Buffer.from([n >> 8, n & 0xff]);
  const video = el([0xe0], Buffer.concat([el([0xb0], u16(width)), el([0xba], u16(height))]));
  const tracks = el([0x16, 0x54, 0xae, 0x6b], el([0xae], video));
  return Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x80]),
    el([0x18, 0x53, 0x80, 0x67], tracks),
  ]);
}

describe('Videos', () => {
  it.each([
    ['mp4', 'video/mp4', mp4Buffer(1920, 1080)],
    ['webm', 'video/webm', webmBuffer(640, 360)],
  ] as const)(
    'akzeptiert %s und liest die Abmessungen aus dem Container',
    async (ext, mime, data) => {
      const res = await uploadImage(t, ed, {
        filename: `film.${ext}`,
        contentType: 'application/octet-stream',
        data,
      });
      expect(res.statusCode).toBe(201);
      const m = res.json().media;
      expect(m.mime).toBe(mime);
      expect(m.width).toBe(ext === 'mp4' ? 1920 : 640);
      expect(m.height).toBe(ext === 'mp4' ? 1080 : 360);
    },
  );

  it('lehnt Container ohne Videospur ab', async () => {
    expectError(
      await uploadImage(t, ed, { data: Buffer.from('....ftypisom\0\0\0\0isom', 'latin1') }),
      415,
      'unsupported_media_type',
    );
  });

  it('erlaubt Videos über dem Bildlimit, Bilder aber nicht', async () => {
    const big = Buffer.concat([mp4Buffer(320, 180), Buffer.alloc(2 * 1024 * 1024)]);
    expect((await uploadImage(t, ed, { data: big })).statusCode).toBe(201);
  });

  it('unterstützt Range-Anfragen und liefert für Videos ein Platzhalter-Vorschaubild', async () => {
    const res = await uploadImage(t, ed, { data: mp4Buffer(320, 180) });
    const id = res.json().media.id as string;
    const range = await t.app.inject({
      method: 'GET',
      url: `/api/v1/media/${id}/file`,
      headers: { cookie: ed.cookie, range: 'bytes=0-7' },
    });
    expect(range.statusCode).toBe(206);
    expect(range.rawPayload.length).toBe(8);
    expect(range.headers['content-range']).toMatch(/^bytes 0-7\//);
    const thumb = await as(t, ed, 'GET', `/api/v1/media/${id}/thumb`);
    expect(thumb.headers['content-type']).toBe('image/svg+xml');
  });
});

describe('Verwaltung', () => {
  it('liefert Datei und Vorschau mit sicheren Headern', async () => {
    const id = await createMedia(t, ed);
    const file = await as(t, ed, 'GET', `/api/v1/media/${id}/file`);
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(file.headers['content-security-policy']).toContain('sandbox');
    const thumb = await as(t, ed, 'GET', `/api/v1/media/${id}/thumb?w=64`);
    expect(thumb.headers['content-type']).toBe('image/webp');
    expectError(await as(t, null, 'GET', `/api/v1/media/${id}/file`), 401, 'unauthenticated');
  });

  it('pflegt Alt-Text je Sprache und Fokuspunkt; leerer Text entfernt die Sprache', async () => {
    const id = await createMedia(t, ed, {});
    const r1 = await as(t, ed, 'PATCH', `/api/v1/media/${id}`, {
      altText: { de: 'Ein Bild', en: 'A picture' },
      focalX: 30,
      focalY: 40,
    });
    expect(r1.json().media).toMatchObject({
      altText: { de: 'Ein Bild', en: 'A picture' },
      focalX: 30,
      focalY: 40,
    });
    const r2 = await as(t, ed, 'PATCH', `/api/v1/media/${id}`, { altText: { en: '' } });
    expect(r2.json().media.altText).toEqual({ de: 'Ein Bild' });
    expectError(
      await as(t, ed, 'PATCH', `/api/v1/media/${id}`, { focalX: 101 }),
      400,
      'validation_error',
    );
  });

  it('löscht unreferenzierte Medien samt Datei', async () => {
    const id = await createMedia(t, ed);
    const before = readdirSync(t.config.media.storageDir, { recursive: true }).length;
    expect((await as(t, ed, 'DELETE', `/api/v1/media/${id}`)).statusCode).toBe(200);
    expectError(await as(t, ed, 'GET', `/api/v1/media/${id}`), 404, 'not_found');
    expect(readdirSync(t.config.media.storageDir, { recursive: true }).length).toBeLessThan(before);
  });

  it('löscht referenzierte Medien nicht (409, Datei bleibt) und markiert sie als in Benutzung', async () => {
    const id = await createMedia(t, ed);
    await createProject(t, ed, { coverMediaId: id });
    expect((await as(t, ed, 'GET', `/api/v1/media/${id}`)).json().media.inUse).toBe(true);
    expectError(await as(t, ed, 'DELETE', `/api/v1/media/${id}`), 409, 'conflict');
    expect((await as(t, ed, 'GET', `/api/v1/media/${id}/file`)).statusCode).toBe(200);
  });

  it('schützt Medien auch auf Datenbankebene (FK ON DELETE RESTRICT)', async () => {
    const cover = await createMedia(t, ed);
    const gal = await createMedia(t, ed);
    const p = await createProject(t, ed, { coverMediaId: cover, gallery: [{ mediaId: gal }] });
    await expect(t.handle.pool.query('delete from media where id = $1', [cover])).rejects.toThrow(
      /foreign key/i,
    );
    await expect(t.handle.pool.query('delete from media where id = $1', [gal])).rejects.toThrow(
      /foreign key/i,
    );
    expect(p.latest.revisionNo).toBe(1);
  });

  it('gibt ein Medium wieder frei, wenn die Referenz entfällt', async () => {
    const cover = await createMedia(t, ed);
    const other = await createMedia(t, ed);
    const p = await createProject(t, ed, { coverMediaId: cover });
    const res = await as(
      t,
      ed,
      'PUT',
      `/api/v1/projects/${p.project.id}/draft`,
      draftBody(p as never, { coverMediaId: other }),
    );
    expect(res.statusCode).toBe(200);
    expect((await as(t, ed, 'DELETE', `/api/v1/media/${cover}`)).statusCode).toBe(200);
  });

  it('listet Medien paginiert', async () => {
    const res = await as(t, ed, 'GET', '/api/v1/media?limit=2&offset=0');
    expect(res.statusCode).toBe(200);
    expect(res.json().media).toHaveLength(2);
    expect(res.json().total).toBeGreaterThan(2);
  });
});
