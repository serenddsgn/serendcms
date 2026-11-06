#!/usr/bin/env bash
# Lokal: führt das Deploy-Skript per SSH auf dem Server aus. `pnpm run deploy:remote [<branch|tag>]`
#   DEPLOY_HOST   z. B. deploy@server.example.com (Pflicht)
#   DEPLOY_PATH   Code-Verzeichnis auf dem Server (Standard /srv/serendportfolio)
set -Eeuo pipefail
: "${DEPLOY_HOST:?DEPLOY_HOST fehlt, z. B. export DEPLOY_HOST=deploy@server.example.com}"
REF="${1:-main}"
DEPLOY_PATH="${DEPLOY_PATH:-/srv/serendportfolio}"
echo "→ Deployment von '$REF' auf $DEPLOY_HOST"
# Der Code kommt per `git pull` aus GitHub (Deploy-Key auf dem Server), nicht per Kopie von diesem Rechner.
ssh -o BatchMode=yes "$DEPLOY_HOST" "sudo -u serend -H bash -lc 'cd $DEPLOY_PATH && pnpm run deploy $REF'"
