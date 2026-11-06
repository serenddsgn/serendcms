# Backup und Wiederherstellung

## Was gesichert wird

- die PostgreSQL-Datenbank (`pg_dump --format=custom`)
- die Medien (`/var/lib/serendportfolio/media`)

Nicht gesichert werden müssen die Releases und die Caches: Die öffentliche Seite wird nach einer Wiederherstellung aus den Daten neu
gebaut. Der Code liegt in GitHub, die Konfiguration unter `/etc/serendportfolio/` (separat sichern, enthält Secrets).

## Einrichtung

1. **Schlüsselpaar** (auf deinem Rechner, nicht auf dem Server): `age-keygen -o backup-key.txt`. Der **öffentliche** Schlüssel
   (`age1…`) kommt als `BACKUP_AGE_RECIPIENT` in `/etc/serendportfolio/backup.env`. Der Server kann damit nur **verschlüsseln**.
   `backup-key.txt` an einem sicheren Ort aufbewahren (Passwortmanager, getrennt vom Server); ohne ihn ist keine Wiederherstellung möglich.
2. **Storage Box** (Hetzner): SSH-Schlüssel anlegen (`ssh-keygen -t ed25519 -f /var/lib/serendportfolio/home/.ssh/backup_ed25519`,
   als `serend`), den öffentlichen Teil in der Storage Box hinterlegen, Host-Key einmal bestätigen
   (`ssh -p23 -i … uXXXX@uXXXX.your-storagebox.de`). Ziel und Port in `backup.env` eintragen.
3. Test: `sudo systemctl start serend-backup && journalctl -u serend-backup -n 20`. Danach läuft es täglich um ca. 03:15 (`serend-backup.timer`).

`backup.sh` erzeugt `db-<zeit>.dump.age` und `media-<zeit>.tar.zst.age`, überträgt beide per rsync/SSH und behält lokal die letzten
`BACKUP_KEEP_LOCAL` (7). Die Aufbewahrung auf der Storage Box regelst du dort (Snapshots oder eigene Löschregel). Zusätzlich legt jedes
Code-Deployment vor den Migrationen ein `pre-deploy-….dump` unter `/var/lib/serendportfolio/backups` an (unverschlüsselt, nur lokal, die letzten 10).

## Wiederherstellung

Auf dem Zielserver (frisch: erst `deploy/server-setup.sh` und das erste Deployment, damit Dienste, Benutzer und Code existieren):

```bash
# Dateien von der Storage Box holen
rsync -e "ssh -p23" uXXXX@uXXXX.your-storagebox.de:serendportfolio/db-20260101-031500.dump.age .
rsync -e "ssh -p23" uXXXX@uXXXX.your-storagebox.de:serendportfolio/media-20260101-031500.tar.zst.age .

# privaten Schlüssel nur für diesen Vorgang bereitstellen
sudo AGE_IDENTITY=/pfad/zu/backup-key.txt /srv/serendportfolio/deploy/restore.sh \
  db-20260101-031500.dump.age media-20260101-031500.tar.zst.age
```

`restore.sh` fragt nach Bestätigung, stoppt die Dienste, ersetzt die Datenbank, entpackt die Medien, startet die Dienste, prüft den
Healthcheck und stößt einen neuen Seiten-Build an. Danach: im Admin unter *Veröffentlichung* den Build abwarten und die Seite prüfen.
Aus einem `pre-deploy-….dump` stellst du nur die Datenbank wieder her (`restore.sh <datei>`).

## Probe

Teste die Wiederherstellung mindestens einmal vor dem Livegang auf einem Wegwerf-Server oder lokal (`pg_restore` in eine leere Datenbank,
Medien entpacken, `pnpm dev`). Ein nie getestetes Backup ist keine Garantie.
