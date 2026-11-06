# Lokale Entwicklung

Alles läuft zunächst auf `localhost`. Die Apps laufen nativ mit Node, Docker (oder eine lokale PostgreSQL-18-Installation)
liefert nur die Datenbank.

## Voraussetzungen

- Node ≥ 22.18 (getestet mit 25), pnpm 9 (`corepack enable`)
- PostgreSQL **18** (wegen `uuidv7()`): per `docker compose up -d` oder lokal installiert
- optional: `gitleaks` (Secret-Scan im Pre-Commit-Hook), Docker für Testcontainers

## Erster Start

```bash
pnpm install                 # installiert auch den Git-Hook (core.hooksPath → .githooks)
pnpm setup:env               # legt .env mit zufälligen Secrets an (Rechte 600)
docker compose up -d         # PostgreSQL 18 + Mailpit (SMTP 1025, Web-UI 8025), nur an localhost
pnpm db:migrate
pnpm db:seed                 # Admin + Beispielinhalte aus dem Design; Passwort wird einmalig ausgegeben
pnpm dev                     # api (4000), admin (5173), web (4321), worker
```

Läuft schon eine andere PostgreSQL auf Port 5432, lege dort eine eigene Datenbank an oder ändere Port und
`DATABASE_URL` in der `.env`.

| Dienst | Adresse | Zweck |
|---|---|---|
| Admin | http://localhost:5173 | Redaktion (Vite-Proxy leitet `/api` an die API: gleiche Origin, kein CORS) |
| API | http://127.0.0.1:4000 | Fastify; OpenAPI unter `/internal/docs` (nur lokal) |
| Web | http://127.0.0.1:4321 | Astro-Entwicklungsserver (liest `/internal/build/*`, braucht `BUILD_TOKEN`) |
| Mailpit | http://localhost:8025 | abgefangene Kontakt-Mails |

Die öffentliche Seite lokal sehen: `pnpm --filter @serend/web build` (API muss laufen, `BUILD_TOKEN` aus der `.env`),
danach `pnpm --filter @serend/web exec astro preview`. Wie in Produktion läuft der Build sonst über den Worker
(„Veröffentlichung“ im Admin → *Seite jetzt neu bauen*; setzt `RELEASES_DIR`, `SITE_URL` und für Lighthouse einen Chromium:
`pnpm --filter @serend/builder exec playwright-core install chromium`, lokal ist `BUILD_CHECK_LIGHTHOUSE=false`).

## Befehle

| Befehl | Wirkung |
|---|---|
| `pnpm dev` | api, admin, web (und worker) parallel |
| `pnpm db:generate` | Migration aus dem Drizzle-Schema erzeugen (nach Änderungen in `packages/db/src/schema.ts`) |
| `pnpm db:migrate` | Migrationen anwenden |
| `pnpm db:seed` | Admin + Beispielinhalte (nicht in Produktion) |
| `pnpm test` | alle Tests inkl. `pnpm audit` (hoch) |
| `pnpm lint`, `pnpm typecheck`, `pnpm format` | Qualitätssicherung |
| `pnpm --filter @serend/api create-admin --email … --name …` | Benutzer anlegen (auch Produktion; ohne `--` vor den Optionen) |
| `pnpm --filter @serend/api seed-content --admin <e-mail>` | Startinhalte aus dem Design anlegen (auch Produktion, nur wenn es noch keine Projekte gibt) |

## Tests

- Vitest gegen **echtes PostgreSQL**: Testcontainers, wenn Docker läuft; sonst startet `@serend/db/testing` einen
  temporären lokalen Cluster aus einer vorhandenen PostgreSQL-18-Installation (`PG_BIN_DIR` oder Homebrew/Debian-Pfad).
  `TEST_DATABASE_ADMIN_URL` nutzt einen vorhandenen Server, `TEST_PG_MODE=docker|native` erzwingt eine Quelle.
- Integrationstests bauen die echte Astro-Seite (`apps/api/test/build-output.test.ts`) und die SSR-Vorschau
  (`preview-ssr.test.ts`) gegen eine Testdatenbank.
- Playwright (`apps/admin/e2e`) startet eine Wegwerf-Umgebung (Datenbank, API, Admin). Browser einmalig:
  `pnpm --filter @serend/builder exec playwright-core install chromium`.

## Projektstruktur

```
apps/api      Fastify: routes → services → repositories; /api/v1 (Admin), /internal (Build, Vorschau)
apps/admin    React + Vite (TanStack Query, React Hook Form, dnd-kit, React Router)
apps/web      Astro: statische Seite aus /internal/build/*; PREVIEW_MODE=1 = SSR-Vorschau
apps/worker   pg-boss: Astro-Build → Prüfungen → Release → Symlink
packages/schema   Zod-Schemas, Blöcke, Markdown-Serializer (einzige Quelle für API, Admin, Web)
packages/db       Drizzle-Schema, Migrationen, Build-/Release-Zustand
packages/builder  Link-/HTML-/JS-Budget-/Lighthouse-Prüfungen, Release-Dateioperationen, CSP-Hashes
deploy/           Caddyfile, systemd, Skripte
```

## Wichtige Regeln

- **Keine Secrets im Frontend.** `VITE_*`/`PUBLIC_*` nie für Secrets. Jeder Build von admin und web läuft durch
  `scripts/check-no-secrets.mjs` (Fund = Fehler).
- **Schemaänderungen an Blöcken** brauchen eine Migrationsfunktion in `packages/schema/src/blocks.ts`
  (`contentMigrations`) und einen Fixture-Test.
- **Neue Pakete** nur nach Rückfrage; `pnpm-lock.yaml` wird immer committet.
- **Git:** je Phase ein Branch, Merge nach `main` nur mit grünen Tests, Conventional Commits, kein Force-Push auf `main`.
