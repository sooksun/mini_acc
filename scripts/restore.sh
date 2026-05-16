#!/bin/sh
# ============================================================
# Restore DB from a backup file. Reads DATABASE_URL like backup.sh.
#
# Usage (on host):
#   docker compose -f docker-compose.prod.yml exec -T backup \
#     /usr/local/bin/restore.sh /backup/2026-05-16_0200.sql.gz
# ============================================================
set -eu

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <backup-file.sql.gz>"
    exit 1
fi

FILE="$1"

if [ ! -f "${FILE}" ]; then
    echo "ERROR: file not found: ${FILE}"
    exit 1
fi

: "${DATABASE_URL:?DATABASE_URL not set}"

URL_NOSCHEME=$(echo "$DATABASE_URL" | sed -E 's#^mysql://##')
CREDS=$(echo "$URL_NOSCHEME" | cut -d@ -f1)
HOSTDB=$(echo "$URL_NOSCHEME" | cut -d@ -f2)
DB_USER=$(echo "$CREDS" | cut -d: -f1)
DB_PASSWORD=$(echo "$CREDS" | cut -d: -f2-)
HOSTPORT=$(echo "$HOSTDB" | cut -d/ -f1)
DB_NAME=$(echo "$HOSTDB" | cut -d/ -f2 | cut -d? -f1)
DB_HOST=$(echo "$HOSTPORT" | cut -d: -f1)
DB_PORT=$(echo "$HOSTPORT" | grep -q ':' && echo "$HOSTPORT" | cut -d: -f2 || echo 3306)

echo "[$(date +%FT%T)] Restoring ${FILE} → ${DB_NAME}@${DB_HOST}:${DB_PORT}"
echo "         This will OVERWRITE the current database. Ctrl-C to cancel."
sleep 5

gunzip < "${FILE}" \
  | mariadb \
      -h "${DB_HOST}" -P "${DB_PORT}" \
      -u "${DB_USER}" \
      -p"${DB_PASSWORD}" \
      --default-character-set=utf8mb4 \
      "${DB_NAME}"

echo "[$(date +%FT%T)] Restore complete"
