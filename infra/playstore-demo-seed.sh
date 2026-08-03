#!/bin/sh
# Seeds the production database (infra/docker-compose.prod.yml) with one real
# Play Store / App Store reviewer account (backend/prisma/seed-playstore-demo.ts)
# — Google Play's pre-launch review and Apple's App Review both require a
# working login handed to them, and this account logs in through the app's
# normal email/password form (unlike `make demo`'s DEMO_MODE one-click
# buttons, which must stay off in production).
#
# Runs after `docker compose ... up --build -d`: the container is reachable
# via `exec` as soon as it starts, which can be well before its own
# entrypoint.sh finishes waiting on Postgres and applying migrations — so
# this retries `migrate deploy` itself first (redundant with, but same
# idempotent command as, entrypoint.sh's own call) before ever touching the
# seed, same defensive ordering as infra/demo-seed.sh.
#
# Idempotent and safe to run on every `make prod`: the seed script itself
# skips entirely if the account already exists (see its own header comment)
# — it never wipes/recreates like infra/demo-seed.sh does for the throwaway
# `make demo` stack.
#
#   sh infra/playstore-demo-seed.sh
#   make prod
set -eu

COMPOSE="docker compose -f infra/docker-compose.prod.yml"

RETRIES=20
DELAY=3

i=0
until $COMPOSE exec -T backend npx prisma migrate deploy >/dev/null 2>&1 &&
  $COMPOSE exec -T backend node dist/prisma/seed-playstore-demo.js; do
  i=$((i + 1))
  if [ "$i" -ge "$RETRIES" ]; then
    echo "playstore-demo-seed: backend still not ready after $((RETRIES * DELAY))s, giving up" >&2
    echo "playstore-demo-seed: check \`docker compose -f infra/docker-compose.prod.yml logs backend\`" >&2
    exit 1
  fi
  echo "playstore-demo-seed: backend not ready yet, retrying in ${DELAY}s... ($i/$RETRIES)"
  sleep "$DELAY"
done
