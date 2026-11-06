#!/usr/bin/env bash
# Backup: pg_dump + Medien, mit age verschlüsselt, danach per rsync/SSH zur Storage Box (außerhalb des Servers).
# Läuft als serend über den systemd-Timer (siehe backup.env.example).
set -Eeuo pipefail
: "${BACKUP_REMOTE:?}" "${BACKUP_SSH_KEY:?}" "${BACKUP_AGE_RECIPIENT:?}"
DATA_DIR="${DATA_DIR:-/var/lib/serendportfolio}"
OUT="$DATA_DIR/backups/scheduled"
STAMP="$(date +%Y%m%d-%H%M%S)"
DB_URL="${DATABASE_URL:-postgres:///serendportfolio?host=/var/run/postgresql}"
umask 077
mkdir -p "$OUT"

pg_dump --format=custom "$DB_URL" | age -r "$BACKUP_AGE_RECIPIENT" > "$OUT/db-$STAMP.dump.age"
tar -C "$DATA_DIR" -cf - media | zstd -q -T0 | age -r "$BACKUP_AGE_RECIPIENT" > "$OUT/media-$STAMP.tar.zst.age"

rsync -a -e "ssh -i $BACKUP_SSH_KEY -p ${BACKUP_SSH_PORT:-23} -o BatchMode=yes -o StrictHostKeyChecking=yes" \
  "$OUT/db-$STAMP.dump.age" "$OUT/media-$STAMP.tar.zst.age" "$BACKUP_REMOTE/"

# Lokal nur die letzten Sicherungen behalten
ls -1t "$OUT"/db-*.age 2>/dev/null | tail -n +$(( ${BACKUP_KEEP_LOCAL:-7} + 1 )) | xargs -r rm -f
ls -1t "$OUT"/media-*.age 2>/dev/null | tail -n +$(( ${BACKUP_KEEP_LOCAL:-7} + 1 )) | xargs -r rm -f
echo "Backup $STAMP abgeschlossen."
