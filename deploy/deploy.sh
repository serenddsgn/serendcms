#!/usr/bin/env bash
# Code-Deployment (läuft auf dem Server als Benutzer `serend`): `pnpm run deploy [<branch|tag>]`
# Ablauf: 1 git pull · 2 pnpm install · 3 Backup + Migrationen · 4 api/admin/Vorschau bauen · 5 Dienste neu starten
#         6 Healthcheck · 7 Produktions-Build der öffentlichen Seite als Job anstoßen
set -Eeuo pipefail

REF="${1:-main}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${DATA_DIR:-/var/lib/serendportfolio}"
BACKUP_DIR="$DATA_DIR/backups"
ADMIN_DIR="$DATA_DIR/admin"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:4000/internal/health}"
export DATABASE_URL="${DATABASE_URL:-postgres:///serendportfolio?host=/var/run/postgresql}"
STEP="Start"
DUMP=""

fail() {
  echo >&2
  echo "✗ Deployment abgebrochen im Schritt: $STEP" >&2
  if [ -n "$DUMP" ]; then
    echo "  Datenbank-Sicherung vor den Migrationen: $DUMP" >&2
    echo "  Wiederherstellung: siehe docs/03-backup-restore.md (restore.sh)" >&2
  fi
  echo "  Die laufenden Dienste wurden nur bei Fehlern NACH Schritt 5 verändert; die Website (aktives Release) bleibt erreichbar." >&2
  exit 1
}
trap fail ERR

# Alles in einer Funktion: Bash liest die ganze Funktion, bevor sie läuft. Schritt 1 (git pull) darf dieses Skript ersetzen,
# ohne dass der laufende Prozess halb alte, halb neue Zeilen ausführt.
main() {
  # Nie zwei Deployments gleichzeitig
  exec 9>"$DATA_DIR/deploy.lock"
  flock -n 9 || { echo "Ein anderes Deployment läuft bereits." >&2; exit 1; }

  cd "$REPO_DIR"

  STEP="1/7 git pull ($REF)"
  echo "→ $STEP"
  git fetch --tags --prune origin
  git checkout --quiet "$REF"
  if git show-ref --verify --quiet "refs/remotes/origin/$REF"; then git merge --ff-only "origin/$REF"; fi
  SHA="$(git rev-parse --short HEAD)"
  echo "  Stand: $SHA"

  STEP="2/7 pnpm install --frozen-lockfile"
  echo "→ $STEP"
  # Mit Dev-Abhängigkeiten: tsx (API/Worker/Migrationen), vite und typescript (Admin-Build) liegen dort. NODE_ENV=production
  # würde sie weglassen; es wird deshalb erst nach der Installation gesetzt.
  NODE_ENV=development pnpm install --frozen-lockfile --prod=false
  export NODE_ENV=production

  STEP="3/7 Datenbank-Backup und Migrationen"
  echo "→ $STEP"
  mkdir -p "$BACKUP_DIR"
  DUMP="$BACKUP_DIR/pre-deploy-$(date +%Y%m%d-%H%M%S)-$SHA.dump"
  pg_dump --format=custom --file="$DUMP" "$DATABASE_URL"
  ls -1t "$BACKUP_DIR"/pre-deploy-*.dump 2>/dev/null | tail -n +11 | xargs -r rm -f
  pnpm db:migrate

  STEP="4/7 api prüfen, admin und Vorschau bauen"
  echo "→ $STEP"
  pnpm --filter @serend/api typecheck
  pnpm --filter @serend/admin build
  mkdir -p "$ADMIN_DIR"
  NEW_ADMIN="$ADMIN_DIR/$SHA-$(date +%s)"
  cp -r apps/admin/dist "$NEW_ADMIN"
  ln -sfn "$NEW_ADMIN" "$ADMIN_DIR/current.new"
  mv -Tf "$ADMIN_DIR/current.new" "$ADMIN_DIR/current"
  ls -1dt "$ADMIN_DIR"/*/ 2>/dev/null | tail -n +4 | xargs -r rm -rf
  # Browser für die Lighthouse-Prüfung (derselbe Pfad wie im Worker-Dienst, sonst findet er ihn nicht)
  export PLAYWRIGHT_BROWSERS_PATH="$DATA_DIR/browsers"
  # (nur beim ersten Mal nötig, sonst sofort fertig)
  pnpm --filter @serend/builder exec playwright-core install chromium >/dev/null
  PREVIEW_MODE=1 pnpm --filter @serend/web build

  STEP="5/7 Dienste neu starten"
  echo "→ $STEP"
  for unit in serend-api serend-worker serend-preview; do
    sudo -n /usr/bin/systemctl restart "$unit"
  done

  STEP="6/7 Healthcheck"
  echo "→ $STEP"
  ok=""
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 2 "$HEALTH_URL" >/dev/null 2>&1; then ok=1; break; fi
    sleep 1
  done
  [ -n "$ok" ] || { echo "  API antwortet nicht auf $HEALTH_URL" >&2; false; }
  for unit in serend-api serend-worker serend-preview; do
    systemctl is-active --quiet "$unit" || { echo "  Dienst $unit läuft nicht (journalctl -u $unit)" >&2; false; }
  done
  echo "  Alle Dienste laufen."

  STEP="7/7 Produktions-Build der öffentlichen Seite anstoßen"
  echo "→ $STEP"
  pnpm --filter @serend/api request-build

  echo "✓ Deployment $SHA fertig. Der Seiten-Build läuft im Worker (Status im Admin unter „Veröffentlichung“)."
}

main "$@"
exit $?
