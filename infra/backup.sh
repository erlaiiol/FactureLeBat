#!/bin/sh
# Dumps the prod Postgres database to infra/backups/. Safe to run repeatedly
# (e.g. from a daily cron entry on the OVH server) — see
# docs/deployment.md#backups. Run from the repo root, or via `make backup`.
set -eu

cd "$(dirname "$0")/.."

# infra/.env is not sourced by a bare `sh infra/backup.sh` the way
# docker-compose reads it, so load POSTGRES_USER/POSTGRES_DB from it here.
set -a
. infra/.env
set +a

mkdir -p infra/backups

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
file="infra/backups/facturelebat_${timestamp}.sql.gz"

docker compose -f infra/docker-compose.prod.yml exec -T postgres \
  pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" | gzip > "$file"

echo "Backup written to $file"

# Keep the last 14 days of daily backups, discard older ones.
find infra/backups -name 'facturelebat_*.sql.gz' -mtime +14 -delete
