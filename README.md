# serendportfolio · serendCMS

Portfolio-Website von serend.design mit selbst entwickeltem Backend („serendCMS“).
Statische Auslieferung (Astro), eigenes Admin (React + Vite), API (Fastify), PostgreSQL.

- Anweisung und Analyse: [`docs/00-analyse.md`](docs/00-analyse.md)
- Design-Vorlage: [`design/`](design)

## Lokale Entwicklung

Voraussetzungen: Node ≥ 22.18, pnpm 9, PostgreSQL 18 (Docker Compose oder lokal).

```bash
pnpm install
pnpm setup:env          # legt .env mit zufälligen Secrets an
docker compose up -d    # PostgreSQL 18 + Mailpit
pnpm db:migrate
pnpm db:seed            # Admin-User (Passwort wird einmalig ausgegeben)
pnpm dev                # api, admin, web parallel
```

Weitere Befehle: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm format`.

Tests brauchen ein echtes PostgreSQL: Testcontainers (Docker) oder, falls Docker fehlt,
ein temporärer lokaler Cluster aus einer vorhandenen PostgreSQL-18-Installation.

## Struktur

```
apps/api       Fastify-API (routes → services → repositories)
apps/admin     React + Vite
apps/web       Astro
packages/schema  Zod-Schemas (einzige Quelle für API, Admin, Web)
packages/db      Drizzle ORM, Migrationen
deploy/        Server-Konfiguration (Phase 6)
```
