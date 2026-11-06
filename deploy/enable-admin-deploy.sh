#!/usr/bin/env bash
# Einmalig als root auf dem Server: schaltet den Button „Jetzt deployen“ im Admin frei (Veröffentlichung → Software-Stand).
#   bash /srv/serendportfolio/deploy/enable-admin-deploy.sh
# Das Skript ist idempotent (mehrfaches Ausführen schadet nicht) und tut genau Folgendes:
#   1. legt /var/lib/serendportfolio/deploy an (Anfrage-, Status- und Log-Dateien)
#   2. installiert serend-deploy.path und serend-deploy.service nach /etc/systemd/system
#   3. trägt DEPLOY_DIR und DEPLOY_REPO_DIR in /etc/serendportfolio/serendportfolio.env ein
#   4. entfernt eine alte, unbeantwortete Anfrage, aktiviert die Path-Unit und startet die API neu
set -Eeuo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Bitte als root ausführen (Hetzner-Console)." >&2; exit 1; }

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_USER="${APP_USER:-serend}"
DATA_DIR="${DATA_DIR:-/var/lib/serendportfolio}"
ENV_FILE="${ENV_FILE:-/etc/serendportfolio/serendportfolio.env}"
UNIT_DIR="${UNIT_DIR:-/etc/systemd/system}"
SYSTEMCTL="${SYSTEMCTL:-systemctl}"

[ -f "$ENV_FILE" ] || { echo "Konfiguration $ENV_FILE nicht gefunden." >&2; exit 1; }

echo "→ Verzeichnis $DATA_DIR/deploy"
install -d -o "$APP_USER" -g "$APP_USER" -m 750 "$DATA_DIR/deploy"

echo "→ systemd-Units"
install -m 644 "$REPO_DIR/deploy/systemd/serend-deploy.path" "$REPO_DIR/deploy/systemd/serend-deploy.service" "$UNIT_DIR/"

echo "→ $ENV_FILE"
# Endet die Datei ohne Zeilenumbruch, würde die erste neue Zeile an die letzte alte geklebt und deren Wert verfälschen
[ -z "$(tail -c1 "$ENV_FILE")" ] || echo >> "$ENV_FILE"
# Reparatur: ein früher angeklebtes „…DEPLOY_DIR=…“ wieder auf eine eigene Zeile lösen
sed -i 's/\(.\)DEPLOY_DIR=\(.*\)$/\1\nDEPLOY_DIR=\2/' "$ENV_FILE"
set_env() { # KEY VALUE
  if grep -q "^$1=" "$ENV_FILE"; then sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"; else printf '%s=%s\n' "$1" "$2" >> "$ENV_FILE"; fi
}
set_env DEPLOY_DIR "$DATA_DIR/deploy"
set_env DEPLOY_REPO_DIR "$REPO_DIR"

echo "→ Aktivieren"
# Eine Anfrage, die die API vor der Einrichtung in den Standardordner gelegt hat, würde sonst weitere Klicks blockieren
rm -f "$REPO_DIR/.data/deploy/request" "$REPO_DIR/apps/api/.data/deploy/request"
"$SYSTEMCTL" daemon-reload
"$SYSTEMCTL" enable --now serend-deploy.path
"$SYSTEMCTL" restart serend-api

echo "✓ Fertig. Im Admin unter „Veröffentlichung“ auf „Jetzt prüfen“ und danach „Jetzt deployen“ klicken."
