#!/bin/sh
# ============================================================
# Daily mariadb-dump → /backup/YYYY-MM-DD.sql.gz
# Keeps the last 14 days; older files are deleted.
#
# Invoked by the `backup` service in docker-compose.prod.yml.
# Env vars expected: DB_HOST DB_NAME DB_USER DB_PASSWORD
# ============================================================
set -eu

STAMP=$(date +%Y-%m-%d_%H%M)
OUTFILE="/backup/${STAMP}.sql.gz"
RETAIN_DAYS=14

echo "[$(date +%FT%T)] Backup starting: ${OUTFILE}"

mariadb-dump \
    -h "${DB_HOST}" \
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

# Rotate — delete files older than RETAIN_DAYS
echo "[$(date +%FT%T)] Pruning backups older than ${RETAIN_DAYS} days"
find /backup -name "*.sql.gz" -type f -mtime "+${RETAIN_DAYS}" -print -delete

echo "[$(date +%FT%T)] Done"
