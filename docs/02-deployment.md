# Deployment

Es gibt **zwei getrennte Abläufe**. Sie dürfen nicht verwechselt werden:

| | Code-Deployment | Inhalts-Veröffentlichung |
|---|---|---|
| Was | neue Version der Software (api, admin, worker, Vorschau, Schema) | neuer Stand der öffentlichen Seite |
| Wer | Entwickler | Redaktion |
| Auslöser | `pnpm run deploy:remote` (lokal) bzw. `pnpm run deploy` (Server) | „Veröffentlichen“ im Admin |
| Ergebnis | Dienste laufen mit neuem Code | neues Release, `current` zeigt darauf |
| Betrifft die Besucher | nein (aktives Release bleibt ausgeliefert) | ja, atomar |

## 1. Code-Deployment

Der Server holt den Code per `git pull` von GitHub (Deploy-Key, **nur Lesezugriff**). Code wird nicht per SSH-Kopie übertragen.

```bash
# lokal
export DEPLOY_HOST=deploy@server.example.com
pnpm run deploy:remote            # Branch main
pnpm run deploy:remote v1.2.0     # oder Tag/Branch
```

Das führt auf dem Server `pnpm run deploy [<ref>]` aus (Achtung: `pnpm deploy` **ohne** `run` ist ein eingebauter
pnpm-Befehl und tut etwas anderes). Ablauf von `deploy/deploy.sh`:

1. `git pull` auf den gewünschten Stand (fast-forward, kein Merge-Commit)
2. `pnpm install --frozen-lockfile`
3. **Datenbank-Backup** (`pg_dump`, die letzten 10 bleiben), dann **Migrationen**
4. api prüfen (`typecheck`), admin bauen und atomar nach `/var/lib/serendportfolio/admin/current` legen, Vorschau (Astro SSR) bauen
5. Dienste per systemd neu starten (`serend-api`, `serend-worker`, `serend-preview`)
6. **Healthcheck** (`/internal/health`, alle Dienste aktiv). Bei Fehler Abbruch mit klarer Meldung und dem Pfad der Datenbank-Sicherung
7. **Produktions-Build** der öffentlichen Seite als Job anstoßen (Trigger „deploy“)

Ein zweites Deployment gleichzeitig wird durch eine Sperrdatei verhindert. Bricht ein Schritt ab, bleibt das aktive Release der
Website unberührt; nur api/admin können auf dem alten oder halb gewechselten Stand stehen. Bei einem Fehler nach den Migrationen:
Fehler beheben und erneut deployen, oder die Sicherung zurückspielen (`docs/03-backup-restore.md`).

## 2. Inhalts-Veröffentlichung

„Veröffentlichen“ im Admin gibt Revisionen frei und legt einen Build-Job an. Mehrere Veröffentlichungen in kurzer Zeit
verschmelzen zu **einem** wartenden Build. Der Worker:

1. holt die freigegebenen Inhalte über `/internal/build/*` (Build-Token, nur localhost) und baut mit Astro,
2. prüft: kaputte Links, HTML-Validität, **JS-Budget ≤ 50 KB (gzip) pro Seite**, **Lighthouse-Performance ≥ 95**,
3. kopiert nach `releases/<id>`, schaltet den Symlink `current` **atomar** um (`rename`) und speichert den Status,
4. lädt Caddy neu, wenn sich Redirects oder die CSP-Hashes geändert haben (`CADDY_RELOAD_COMMAND`).

Ein fehlgeschlagener Build ersetzt **nie** das aktive Release. Das Build-Log und die Prüfergebnisse stehen im Admin unter
*Veröffentlichung → Details*. Der Astro-Asset-Cache (`ASSET_CACHE_DIR`) bleibt zwischen Builds erhalten, deshalb sind
Folgebuilds schnell.

**Rollback:** im Admin *Veröffentlichung → Releases → Rollback* (nur Administratoren). Der Symlink wird atomar auf das frühere
Release gesetzt; die letzten `KEEP_RELEASES` (Standard 10) bleiben erhalten.

## Vorschau

Im Editor erzeugt *Vorschau* einen signierten Link (HMAC, **max. 15 Minuten**) auf `preview.<domain>`. Der Link zeigt die neueste
Revision des Inhalts, alles andere wie veröffentlicht. Das Token wird beim ersten Aufruf gegen ein HttpOnly-Cookie getauscht und per
Redirect aus der URL entfernt; Caddy schreibt es nicht ins Log. Die Vorschau sendet `noindex, nofollow` (Meta und Header) und
`Referrer-Policy: no-referrer` und läuft ohne Secrets.

## Betrieb

| Dienst | Aufgabe | Log |
|---|---|---|
| `serend-api` | Admin-API, interne Endpunkte (nur localhost) | `journalctl -u serend-api` |
| `serend-worker` | Builds, Prüfungen, Releases, Aufbewahrung der Kontaktnachrichten | `journalctl -u serend-worker` |
| `serend-preview` | SSR-Vorschau | `journalctl -u serend-preview` |
| `caddy` | TLS, statische Auslieferung, Reverse Proxy | `/var/log/caddy/*.log` |
| `serend-backup.timer` | tägliches Backup | `journalctl -u serend-backup` |

Es werden nie Passwörter, Tokens, Cookies oder Formularinhalte geloggt.

## Sicherheitskonfiguration (Überblick)

- Eigener Systembenutzer `serend` ohne Login-Shell; Dienste mit systemd-Härtung (`NoNewPrivileges`, `ProtectSystem=strict`, …).
- Env-Dateien unter `/etc/serendportfolio/` (Rechte 600, `root`), per `EnvironmentFile`; Secrets nur für api und worker, die Vorschau hat eine eigene Datei ohne Secrets.
- Produktions-Secrets entstehen zufällig auf dem Server (`openssl rand -base64 48`), nie im Repo; lokale und Produktionswerte sind getrennt.
- Firewall: nur 22, 80, 443. SSH nur mit Schlüssel, kein Root-Login, kein Passwort.
- PostgreSQL und API nur an localhost; Datenbank-Zugriff per Unix-Socket (Peer), es gibt kein Datenbank-Passwort.
- Caddy: HSTS, CSP (Skripte nur `'self'` plus Hashes der Inline-Skripte des jeweiligen Builds), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
  `/internal/*` und `/build-meta/*` werden nie ausgeliefert. Optional: IP-Allowlist für `admin.<domain>` (Beispiel im Caddyfile).
- Backups verschlüsselt (age) und außerhalb des Servers (siehe `docs/03-backup-restore.md`).

## Wartungsmodus („Wir überarbeiten unsere Webseite“)

Im Admin unter **Wartungsmodus** (nur Administratoren dürfen umschalten) lässt sich die öffentliche Seite hinter eine Wartungsseite legen: Logo
(oder Wortmarke), die Überschrift in DE/EN, im Design der Seite. Das wirkt **sofort**, ein Build ist nicht nötig, und die Redaktion arbeitet
normal weiter.

- **Besucher** sehen die Wartungsseite mit Status 503, `Retry-After` und `noindex`; Suchmaschinen behalten den bisherigen Stand.
- **Redakteure** klicken im Admin auf *Seite als Redakteur ansehen*: Der Einmal-Link (5 Minuten) setzt ein HttpOnly-Cookie (8 Stunden) auf der
  öffentlichen Domain. Caddy lässt dann die echte Seite durch.
- **Technik:** Das Admin schreibt `maintenance.html`, das Logo und die Flag-Datei `on` nach `/var/lib/serendportfolio/maintenance`. Caddy prüft nur
  das Vorhandensein dieser Datei (kein Backend-Aufruf für normale Besucher) und fragt im Wartungsmodus die API (`forward_auth`), ob das Cookie gültig ist.
  Ist die API dann nicht erreichbar, bleibt die Wartungsseite stehen (fail-closed).
- Eine rote Leiste im Admin erinnert daran, solange der Modus an ist.
- **Vor dem Livegang:** erstes Deployment, einloggen, Wartungsmodus aktivieren (Logo hochladen), erst danach die Domain freigeben bzw. Inhalte veröffentlichen.
- Logo: PNG, WebP, JPEG oder AVIF (kein SVG, aus Sicherheitsgründen), am besten mit transparentem Hintergrund und mindestens 400 px Höhe.
