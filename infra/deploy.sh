#!/bin/sh
# Ships a new version to a server already running the prod stack (see
# docs/deployment.md). Run from the repo root, or via `make deploy`.
#
# Migrations are not run here — the backend's own entrypoint.sh applies
# pending Prisma migrations before it starts serving traffic (see
# backend/entrypoint.sh), so a normal deploy is just: pull, rebuild, recreate.
set -eu

cd "$(dirname "$0")/.."

# Phase 21: DOMAIN=:80 (infra/.env.example's default) is the local/`make
# prod` smoke-test fallback — Caddy serves plain HTTP with no ACME attempt.
# A real redeploy running this script against a live server must have a real
# DOMAIN set, or it silently ships with no HTTPS/HSTS/CSP at all instead of
# failing loudly.
if [ -f infra/.env ]; then
	DEPLOY_DOMAIN=$(grep -E '^DOMAIN=' infra/.env | tail -n1 | cut -d= -f2-)
	if [ -z "$DEPLOY_DOMAIN" ] || [ "$DEPLOY_DOMAIN" = ':80' ]; then
		echo "==> Refusing to deploy: infra/.env's DOMAIN is '$DEPLOY_DOMAIN', the local smoke-test default." >&2
		echo "    Set DOMAIN to the real domain (e.g. DOMAIN=factures.example.com) before deploying." >&2
		exit 1
	fi
fi

echo "==> Pulling latest code"
git pull --ff-only

echo "==> Building images"
docker compose -f infra/docker-compose.prod.yml build

echo "==> Recreating containers"
docker compose -f infra/docker-compose.prod.yml up -d

# Caddy has no `build:` (plain caddy:2-alpine, Caddyfile bind-mounted
# read-only) — `up -d` above only recreates a container whose *compose*
# config changed, so a Caddyfile-only edit lands on disk via git pull but
# never reaches the running process. `caddy reload` re-reads the mounted
# file and swaps the config with no dropped connections; harmless no-op if
# the Caddyfile didn't actually change this deploy.
echo "==> Reloading Caddy config"
docker compose -f infra/docker-compose.prod.yml exec caddy caddy reload --config /etc/caddy/Caddyfile

echo "==> Removing dangling images"
docker image prune -f

echo "==> Done. Recent backend logs:"
docker compose -f infra/docker-compose.prod.yml logs --tail=50 backend
