# serendportfolio · serendCMS

Portfolio-Website von serend.design mit selbst entwickeltem Backend („serendCMS“).
Statische Auslieferung (Astro), eigenes Admin (React + Vite), API (Fastify), PostgreSQL.

- Anweisung und Analyse: [`docs/00-analyse.md`](docs/00-analyse.md)
- Design-Vorlage: [`design/`](design)

## Dokumentation

| Thema                                                     | Datei                                                    |
| --------------------------------------------------------- | -------------------------------------------------------- |
| Analyse, Datenmodell, Blockkatalog, Endpunkte             | [`docs/00-analyse.md`](docs/00-analyse.md)               |
| Lokale Entwicklung                                        | [`docs/01-entwicklung.md`](docs/01-entwicklung.md)       |
| Deployment (Code-Deployment und Inhalts-Veröffentlichung) | [`docs/02-deployment.md`](docs/02-deployment.md)         |
| Backup und Wiederherstellung                              | [`docs/03-backup-restore.md`](docs/03-backup-restore.md) |
| Einrichtung eines frischen Hetzner-Servers                | [`deploy/README.md`](deploy/README.md)                   |

## Schnellstart (lokal)

```bash
pnpm install
pnpm setup:env          # .env mit zufälligen Secrets
docker compose up -d    # PostgreSQL 18 + Mailpit
pnpm db:migrate
pnpm db:seed            # Admin + Beispielinhalte (Passwort wird einmalig ausgegeben)
pnpm dev                # api, worker, admin, web
```

`pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm format`. Details: [`docs/01-entwicklung.md`](docs/01-entwicklung.md).

## Architektur in einem Absatz

Die öffentliche Seite ist vollständiges statisches HTML (Astro). Der Worker baut sie aus den freigegebenen Inhalten
(`/internal/build/*`, Build-Token, nur localhost), prüft sie (Links, HTML, JS-Budget, Lighthouse) und schaltet den Symlink
`current` atomar um. Es gibt keine öffentliche Content-API; nach dem Deployment hängt die Seite nur beim Kontaktformular am Backend.
Redaktion arbeitet im Admin (`admin.<domain>`), Vorschau über signierte, 15 Minuten gültige Links.

## Struktur

```
apps/api       Fastify-API (routes → services → repositories)
apps/admin     React + Vite
apps/web       Astro (statisch; PREVIEW_MODE=1 = SSR-Vorschau)
apps/worker    pg-boss: Build, Prüfungen, Releases
packages/schema   Zod-Schemas (einzige Quelle für API, Admin, Web)
packages/db       Drizzle ORM, Migrationen
packages/builder  Prüfungen und Release-Dateioperationen
deploy/        Caddyfile, systemd, Skripte, Server-Einrichtung
```
