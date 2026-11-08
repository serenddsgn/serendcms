import { expect, test, type Page } from '@playwright/test';

const USER = { email: 'e2e-admin@example.com', password: 'e2e-passwort-12345' };
// 1×1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(USER.email);
  await page.getByLabel('Passwort').fill(USER.password);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Veröffentlichung' })).toBeVisible();
}

test('Anmeldung schlägt mit falschem Passwort fehl und klappt mit richtigem', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(USER.email);
  await page.getByLabel('Passwort').fill('falsches-passwort');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('alert')).toContainText('E-Mail oder Passwort ist falsch');
  await page.getByLabel('Passwort').fill(USER.password);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Veröffentlichung' })).toBeVisible();
});

test('Projekt anlegen, Cover hochladen, veröffentlichen und den Build im Status sehen', async ({
  page,
}) => {
  await login(page);

  // Projekt anlegen
  await page.getByRole('link', { name: 'Projekte' }).click();
  await page.getByRole('button', { name: 'Neues Projekt' }).click();
  await page.getByLabel('Titel').fill('E2E Projekt');
  await page.getByLabel('Slug (URL)').fill('e2e-projekt');
  await page.getByRole('button', { name: 'Anlegen' }).click();
  await expect(page.getByRole('heading', { name: 'E2E Projekt' })).toBeVisible();

  // ohne Cover ist das Veröffentlichen nicht möglich: klare Fehlermeldung
  await page.getByRole('button', { name: 'Veröffentlichen' }).click();
  await expect(page.getByRole('alert')).toContainText('Cover-Bild fehlt');

  // Bild hochladen und als Cover wählen
  await page.getByRole('button', { name: 'Wählen' }).first().click();
  await page
    .getByLabel('Datei hochladen')
    .setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: PNG });
  await page.getByRole('button', { name: 'Hochladen und wählen' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  // Alt-Text fehlt noch: Veröffentlichen schlägt mit Hinweis fehl
  await page.getByRole('button', { name: 'Veröffentlichen' }).click();
  await expect(page.getByRole('alert')).toContainText('Alt-Text des Covers fehlt');

  // Alt-Text in der Medienbibliothek pflegen
  await page.getByRole('link', { name: 'Medien' }).click();
  await page.getByRole('button', { name: /cover\.png/ }).click();
  await page.getByLabel('Alt-Text (DE)').fill('Ein Testbild');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  // Jetzt klappt das Veröffentlichen
  await page.getByRole('link', { name: 'Projekte' }).click();
  await page.getByRole('link', { name: 'E2E Projekt' }).click();
  await page.getByRole('button', { name: 'Veröffentlichen' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Veröffentlicht' })).toBeVisible();

  // Der Build ist in der Warteschlange und im Status sichtbar
  await page.getByRole('link', { name: 'Veröffentlichung' }).click();
  await expect(page.getByRole('cell', { name: 'publish' }).first()).toBeVisible();
  await expect(page.getByText('queued').first()).toBeVisible();
});

test('Wartungsmodus ein- und ausschalten (rote Leiste in der ganzen Oberfläche)', async ({
  page,
}) => {
  await login(page);
  await page.getByRole('link', { name: 'Wartungsmodus' }).click();
  await expect(page.getByText('AUS: Seite ist öffentlich')).toBeVisible();
  await page.getByLabel('Wartungsmodus aktivieren').check();
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('AN: Besucher sehen die Wartungsseite')).toBeVisible();
  await page.getByRole('link', { name: 'Projekte' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Wartungsmodus ist AN' })).toBeVisible();
  await page.getByRole('link', { name: 'Wartungsmodus' }).first().click();
  await page.getByLabel('Wartungsmodus aktivieren').uncheck();
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('AUS: Seite ist öffentlich')).toBeVisible();
});

test('Anthropic-Key speichern schaltet den Übersetzen-Button frei; der Key wird nie wieder angezeigt', async ({
  page,
}) => {
  const key = 'sk-ant-e2e-testkey-1234567890';
  await login(page);

  // ohne Key: kein Button im Seiten-Editor
  await page.getByRole('link', { name: 'Seiten' }).click();
  await page.getByRole('button', { name: 'Neue Seite' }).click();
  await page.getByLabel('Titel').fill('Übersetzungstest');
  await page.getByLabel('Slug (URL)').fill('uebersetzungstest');
  await page.getByRole('button', { name: 'Anlegen' }).click();
  await expect(page.getByRole('heading', { name: 'Übersetzungstest' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Automatisch nach/ })).toHaveCount(0);

  // Key hinterlegen
  await page.getByRole('link', { name: 'Einstellungen' }).click();
  await expect(page.getByText('nicht eingerichtet')).toBeVisible();
  await page.getByLabel('Anthropic-Key').fill(key);
  await page.getByRole('button', { name: 'Key speichern' }).click();
  await expect(page.getByText('eingerichtet (Key endet auf …7890)')).toBeVisible();
  await expect(page.getByLabel(/Neuer Key/)).toHaveValue('');
  expect(await page.content()).not.toContain(key);

  // Original ohne Gegenversion: kein Button. Nach „Kopie als EN-Version anlegen“ erscheint er in der Kopie.
  await page.getByRole('link', { name: 'Seiten' }).click();
  await page.getByRole('link', { name: 'Übersetzungstest' }).click();
  await expect(page.getByRole('heading', { name: 'Übersetzungstest' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Automatisch nach/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Kopie als EN-Version anlegen' }).click();
  await expect(page.getByText('EN ·')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Automatisch nach EN übersetzen' })).toBeVisible();

  // Key entfernen schaltet ihn wieder ab
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('link', { name: 'Einstellungen' }).click();
  await page.getByRole('button', { name: 'Key entfernen' }).click();
  await expect(page.getByText('nicht eingerichtet')).toBeVisible();
});

test('Abmelden beendet die Session', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await expect(page.getByRole('button', { name: 'Anmelden' })).toBeVisible();
  await page.goto('/projects');
  await expect(page.getByRole('button', { name: 'Anmelden' })).toBeVisible();
});
