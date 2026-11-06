#!/usr/bin/env bash
# Wiederherstellung auf einem (frischen oder bestehenden) Server. Läuft als root.
#   restore.sh <db-….dump.age> [<media-….tar.zst.age>]
# Benötigt den PRIVATEN age-Schlüssel (nicht auf dem Server gespeichert): AGE_IDENTITY=/pfad/zu/key.txt
# Eine unverschlüsselte pre-deploy-….dump-Datei wird ebenfalls akzeptiert.
set -Eeuo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Bitte als root ausführen." >&2; exit 1; }
DB_FILE="${1:?Aufruf: restore.sh <db-dump> [<media-archiv>]}"
MEDIA_FILE="${2:-}"
DATA_DIR="${DATA_DIR:-/var/lib/serendportfolio}"
DB_NAME="${DB_NAME:-serendportfolio}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:4000/internal/health}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

read -r -p "Datenbank '$DB_NAME' wird ÜBERSCHRIEBEN. Fortfahren? (ja/nein) " answer
[ "$answer" = "ja" ] || { echo "Abgebrochen."; exit 1; }

decrypt() { if [[ "$1" == *.age ]]; then : "${AGE_IDENTITY:?AGE_IDENTITY fehlt}"; age -d -i "$AGE_IDENTITY" "$1"; else cat "$1"; fi; }

systemctl stop serend-worker serend-api serend-preview || true

decrypt "$DB_FILE" > "$TMP/db.dump"
sudo -u postgres dropdb --if-exists "$DB_NAME"
sudo -u postgres createdb --owner=serend "$DB_NAME"
sudo -u serend pg_restore --no-owner --dbname="postgres:///$DB_NAME?host=/var/run/postgresql" "$TMP/db.dump"
echo "✓ Datenbank wiederhergestellt."

if [ -n "$MEDIA_FILE" ]; then
  decrypt "$MEDIA_FILE" | zstd -dc > "$TMP/media.tar"
  rm -rf "$DATA_DIR/media"
  tar -C "$DATA_DIR" -xf "$TMP/media.tar"
  chown -R serend:serend "$DATA_DIR/media"
  echo "✓ Medien wiederhergestellt."
fi

systemctl start serend-api serend-worker serend-preview
for _ in $(seq 1 30); do curl -fsS --max-time 2 "$HEALTH_URL" >/dev/null 2>&1 && ok=1 && break; sleep 1; done
[ -n "${ok:-}" ] || { echo "API antwortet nicht; journalctl -u serend-api prüfen." >&2; exit 1; }
sudo -u serend -H bash -lc "cd /srv/serendportfolio && DATABASE_URL='postgres:///$DB_NAME?host=/var/run/postgresql' pnpm --filter @serend/api request-build"
echo "✓ Fertig. Der Seiten-Build wurde angestoßen, die öffentliche Seite wird aus den wiederhergestellten Daten neu erzeugt."
