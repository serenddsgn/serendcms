#!/usr/bin/env bash
# Läuft als `serend-deploy.service` (Benutzer serend), gestartet von `serend-deploy.path`, sobald die Admin-API die Anfrage-Datei
# <DEPLOY_DIR>/request angelegt hat (Admin → Veröffentlichung → „Jetzt deployen“). Führt `deploy/deploy.sh <ref>` aus und schreibt
# Status (status.json) und Log (deploy.log) in dasselbe Verzeichnis, das die API liest.
# Warum ein eigener Dienst: Die API ist per systemd gehärtet (kein sudo) und würde sich beim Neustart selbst beenden.
set -uo pipefail

# Alles in einer Funktion: deploy.sh holt per `git pull` neuen Code, auch für dieses Skript. Bash liest die ganze Funktion vorher.
main() {
  local data_dir="${DATA_DIR:-/var/lib/serendportfolio}"
  local dir="${DEPLOY_DIR:-$data_dir/deploy}"
  local repo_dir
  repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  local req="$dir/request" running="$dir/request.running" status="$dir/status.json" log="$dir/deploy.log"

  [ -f "$req" ] || exit 0

  # Anfrage übernehmen: ab hier löst sie den Path-Unit nicht mehr aus
  local ref
  ref="$(sed -n 's/^ref=//p' "$req" | head -n1)"
  mv -f "$req" "$running"
  # Nur harmlose Branch-/Tag-Namen, nie etwas mit führendem „-“ (wäre eine git-Option)
  if ! [[ "$ref" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ ]]; then
    ref="main"
  fi

  write_status() { # state sha [finished]
    local tmp="$status.tmp"
    printf '{"state":"%s","ref":"%s","sha":"%s","startedAt":"%s","finishedAt":"%s"}\n' \
      "$1" "$ref" "$2" "$started" "${3:-}" > "$tmp" && mv -f "$tmp" "$status"
  }

  local started
  started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  : > "$log"
  write_status running ""
  echo "→ Deployment von '$ref' gestartet ($started)" >> "$log"

  bash "$repo_dir/deploy/deploy.sh" "$ref" >> "$log" 2>&1
  local code=$?

  local sha
  sha="$(git -C "$repo_dir" rev-parse --short HEAD 2>/dev/null || true)"
  if [ "$code" -eq 0 ]; then
    write_status success "$sha" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  else
    echo "✗ deploy.sh endete mit Code $code" >> "$log"
    write_status failed "$sha" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  fi
  rm -f "$running"
  return "$code"
}

main "$@"
exit $?
