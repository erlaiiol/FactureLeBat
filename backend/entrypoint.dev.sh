#!/bin/sh
# Dev entrypoint (infra/docker-compose.yml, Dockerfile `dev` target).
# Applies whatever migrations are already committed (never generates new
# ones — that stays the deliberate, manual `make migrate` step, since
# `prisma migrate dev` can prompt interactively on schema drift, which would
# just hang a container) before starting the watch server.
set -eu

. ./wait-for-db.sh

echo "entrypoint: applying pending migrations..."
npx prisma migrate deploy

echo "entrypoint: starting the dev server..."
exec npm run start:dev
