#!/bin/sh
# ============================================================
# Restore DB from a backup file
#
# Usage (on host):
#   docker compose -f docker-compose.prod.yml exec -T db sh -c \
#     'gunzip < /backup/2026-05-16_0200.sql.gz \
#       | mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" hjacc'
#
# Or, more interactively from inside the `backup` container:
#   docker compose -f docker-compose.prod.yml exec backup sh /usr/local/bin/restore.sh /backup/2026-05-16_0200.sql.gz
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

echo "[$(date +%FT%T)] Restoring ${FILE} → ${DB_NAME}@${DB_HOST}"
echo "         This will OVERWRITE the current database. Ctrl-C to cancel."
sleep 5

gunzip < "${FILE}" \
  | mariadb \
      -h "${DB_HOST}" \
      -u "${DB_USER}" \
      -p"${DB_PASSWORD}" \
      --default-character-set=utf8mb4 \
      "${DB_NAME}"

echo "[$(date +%FT%T)] Restore complete"
