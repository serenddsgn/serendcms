# Deployment-Dateien

Einrichtungsanleitung für einen **frischen Hetzner-Server** (Ubuntu 24.04 oder Debian 12+). Die ausführliche Beschreibung der beiden
Abläufe (Code-Deployment, Inhalts-Veröffentlichung) steht in [`docs/02-deployment.md`](../docs/02-deployment.md), Backup und
Wiederherstellung in [`docs/03-backup-restore.md`](../docs/03-backup-restore.md).

| Datei | Zweck |
|---|---|
| `server-setup.sh` | richtet einen frischen Server ein (Pakete, Benutzer, Firewall, SSH-Härtung, PostgreSQL 18, Caddy, systemd, Deploy-Key) |
| `deploy.sh` | Code-Deployment auf dem Server (`pnpm run deploy`) |
| `deploy-remote.sh` | lokal: führt `deploy.sh` per SSH aus (`pnpm run deploy:remote`) |
| `enable-admin-deploy.sh` | einmalig als root: schaltet den Deploy-Button im Admin frei (Units, Verzeichnis, Env) |
| `deploy-run.sh` | läuft als `serend-deploy.service`: führt `deploy.sh` aus, wenn der Admin „Jetzt deployen“ klickt (`docs/02-deployment.md`) |
| `backup.sh`, `restore.sh` | verschlüsselte Sicherung nach außen, Wiederherstellung |
| `Caddyfile` | Website, Admin/API, Vorschau; Security-Header, Redirects, Kontaktformular-Weiterleitung |
| `systemd/` | `serend-api`, `serend-worker`, `serend-preview`, Backup-Service und -Timer |
| `sudoers.d/serend` | die wenigen `systemctl`-Befehle, die der Dienstbenutzer ausführen darf |
| `env.production.example`, `preview.env.example`, `backup.env.example` | Vorlagen für `/etc/serendportfolio/*.env` |

## Server-Pfade

```
/srv/serendportfolio                       Code (git clone, Besitzer serend)
/etc/serendportfolio/*.env                 Konfiguration und Secrets (Rechte 600)
/var/lib/serendportfolio/media             hochgeladene Bilder
/var/lib/serendportfolio/releases/<id>     gebaute Seiten; `current` → aktives Release (Caddy liefert es aus)
/var/lib/serendportfolio/admin/current     gebautes Admin
/var/lib/serendportfolio/cache             Astro-/Bild-Cache (bleibt zwischen Builds)
/var/lib/serendportfolio/backups           pre-deploy-Dumps und geplante Backups
/var/log/caddy/                            Zugriffslogs (ohne Vorschau-Token)
```

## 1. Server und DNS

1. Hetzner-Server anlegen (Ubuntu 24.04), deinen SSH-Schlüssel hinterlegen, als `root` einloggen.
2. DNS: `A`/`AAAA` für `example.com`, `www.`, `admin.` und `preview.` auf die Server-IP.
3. Repository auf den Server bringen (nur dieses Skript-Verzeichnis wird benötigt) oder als `root` kurz klonen:
   `git clone https://github.com/serenddsgn/serendcms.git /root/serendcms`.

## 2. Einrichten

```bash
cd /root/serendcms/deploy
DOMAIN=example.com ACME_EMAIL=du@example.com ADMIN_SSH_USER=deploy \
REPO_URL=git@github.com:serenddsgn/serendcms.git \
  bash server-setup.sh
```

Das Skript bricht ab, **bevor** es SSH härtet, wenn kein SSH-Schlüssel für den neuen Admin-Benutzer vorliegt (sonst sperrst du dich aus).
Es gibt am Ende den öffentlichen **Deploy-Key** aus: in GitHub unter *Settings → Deploy keys* eintragen, **ohne** Schreibrechte.

Danach:

1. Vorlagen prüfen und ergänzen: `/etc/serendportfolio/serendportfolio.env` (SMTP, `CONTACT_NOTIFY_TO`). Die Secrets sind bereits zufällig erzeugt.
2. **Erstes Deployment** und ersten Admin anlegen:
   ```bash
   ssh deploy@example.com
   sudo -u serend -H bash -lc 'cd /srv/serendportfolio && pnpm run deploy main'
   sudo -u serend -H bash -lc 'cd /srv/serendportfolio && DATABASE_URL=postgres:///serendportfolio?host=/var/run/postgresql \
     pnpm --filter @serend/api create-admin --email du@example.com --name "Dein Name"'
   ```
   Das Passwort wird einmalig ausgegeben; nach dem ersten Login ändern.
3. **Startinhalte** aus dem Design anlegen (12 Projekte in DE und EN, Seiten, Leistungen, Navigation, Einstellungen, Bilder). Ohne Inhalte schlägt
   der erste Seiten-Build fehl („Pflichtseite home fehlt“), denn eine leere Datenbank hat noch keine Startseite:
   ```bash
   sudo -u serend -H bash -lc 'cd /srv/serendportfolio && DATABASE_URL=postgres:///serendportfolio?host=/var/run/postgresql \
     STORAGE_DIR=/var/lib/serendportfolio/media pnpm --filter @serend/api seed-content --admin du@example.com'
   sudo -u serend -H bash -lc 'cd /srv/serendportfolio && DATABASE_URL=postgres:///serendportfolio?host=/var/run/postgresql \
     pnpm --filter @serend/api request-build'
   ```
   Der Befehl ändert nichts, wenn es schon Projekte gibt.
4. Warten, bis der erste Seiten-Build durch ist (Admin → *Veröffentlichung*), dann `https://example.com` prüfen.
5. Backups einrichten (`docs/03-backup-restore.md`) und eine Wiederherstellung testen.

## 3. Laufender Betrieb

- Neue Softwareversion: im Admin unter *Veröffentlichung* auf **Jetzt deployen** klicken (der Kasten „Software-Stand“ zeigt neue Commits auf `main`), oder lokal `pnpm run deploy:remote`.
- Inhalte: im Admin veröffentlichen.
- Rechtstexte (Impressum, Datenschutz) liegen als **Entwürfe** im Admin und müssen von dir mit echtem Inhalt gefüllt und veröffentlicht werden;
  bis dahin ist die Fußzeilenspalte „Rechtliches“ leer.
- Kontaktformular: der Endpunkt `POST /api/contact` ist eingerichtet (Caddy → API); die Seite zeigt aktuell nur die E-Mail-Adresse,
  weil das Design kein Formular enthält.
