#!/bin/sh
# ============================================================
# Generate strong secrets for .env.production
#
# Outputs three lines you can paste into .env.production:
#   JWT_SECRET=...
#   DB_PASSWORD=...
#   DB_ROOT_PASSWORD=...
#
# Run on a machine with openssl available.
# ============================================================
set -eu

if ! command -v openssl >/dev/null 2>&1; then
    echo "ERROR: openssl is required." >&2
    exit 1
fi

echo "# --- HJ Account AI production secrets ---"
echo "# Generated $(date +%FT%T) on $(hostname)"
echo "# Paste these into .env.production. DO NOT commit that file."
echo
echo "JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')"
echo "DB_PASSWORD=$(openssl rand -base64 24 | tr -d '\n=' | head -c 32)"
echo "DB_ROOT_PASSWORD=$(openssl rand -base64 24 | tr -d '\n=' | head -c 32)"
