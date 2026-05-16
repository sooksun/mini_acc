#!/bin/sh
# ============================================================
# Daily mariadb-dump → /backup/YYYY-MM-DD.sql.gz
# Keeps the last 14 days; older files are deleted.
#
# Invoked by the `backup` service in docker-compose.prod.yml.
# Reads DATABASE_URL (mysql://user:pass@host:port/db) — same connection as api.
# ============================================================
set -eu

: "${DATABASE_URL:?DATABASE_URL not set}"

# Parse mysql://user:pass@host:port/dbname into shell vars.
# Strip scheme, then split on @ (creds vs host/db), then on / (host vs db),
# then on : (user/pass and host/port).
URL_NOSCHEME=$(echo "$DATABASE_URL" | sed -E 's#^mysql://##')
CREDS=$(echo "$URL_NOSCHEME" | cut -d@ -f1)
HOSTDB=$(echo "$URL_NOSCHEME" | cut -d@ -f2)

DB_USER=$(echo "$CREDS" | cut -d: -f1)
DB_PASSWORD=$(echo "$CREDS" | cut -d: -f2-)
HOSTPORT=$(echo "$HOSTDB" | cut -d/ -f1)
DB_NAME=$(echo "$HOSTDB" | cut -d/ -f2 | cut -d? -f1)
DB_HOST=$(echo "$HOSTPORT" | cut -d: -f1)
DB_PORT=$(echo "$HOSTPORT" | grep -q ':' && echo "$HOSTPORT" | cut -d: -f2 || echo 3306)

STAMP=$(date +%Y-%m-%d_%H%M)
OUTFILE="/backup/${STAMP}.sql.gz"
RETAIN_DAYS=14

echo "[$(date +%FT%T)] Backup starting: ${OUTFILE} (db=${DB_NAME}@${DB_HOST}:${DB_PORT})"

mariadb-dump \
    -h "${DB_HOST}" -P "${DB_PORT}" \
    -u "${DB_USER}" \
    -p"${DB_PASSWORD}" \
    --single-transaction \
    --quick \
    --routines \
    --triggers \
    --events \
    --default-character-set=utf8mb4 \
    "${DB_NAME}" \
  | gzip -9 > "${OUTFILE}"

SIZE=$(du -h "${OUTFILE}" | cut -f1)
echo "[$(date +%FT%T)] Backup complete: ${OUTFILE} (${SIZE})"

echo "[$(date +%FT%T)] Pruning backups older than ${RETAIN_DAYS} days"
find /backup -name "*.sql.gz" -type f -mtime "+${RETAIN_DAYS}" -print -delete

echo "[$(date +%FT%T)] Done"
