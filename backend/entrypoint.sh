#!/bin/sh
# Prod entrypoint (infra/docker-compose.prod.yml, Dockerfile `prod` target).
# Applies pending migrations, then starts the compiled server. Never runs
# `migrate dev` — only `migrate deploy`, which just applies already-committed
# migration files and never prompts or generates one (safe to automate).
set -eu

. ./wait-for-db.sh

echo "entrypoint: applying pending migrations..."
npx prisma migrate deploy

echo "entrypoint: starting the API..."
exec node dist/src/main.js
