#!/bin/sh
# Ships a new version to a server already running the prod stack (see
# docs/deployment.md). Run from the repo root, or via `make deploy`.
#
# Migrations are not run here — the backend's own entrypoint.sh applies
# pending Prisma migrations before it starts serving traffic (see
# backend/entrypoint.sh), so a normal deploy is just: pull, rebuild, recreate.
set -eu

cd "$(dirname "$0")/.."

echo "==> Pulling latest code"
git pull --ff-only

echo "==> Building images"
docker compose -f infra/docker-compose.prod.yml build

echo "==> Recreating containers"
docker compose -f infra/docker-compose.prod.yml up -d

echo "==> Removing dangling images"
docker image prune -f

echo "==> Done. Recent backend logs:"
docker compose -f infra/docker-compose.prod.yml logs --tail=50 backend
