#!/bin/sh
# Seeds the `make demo` stack (backend/prisma/seed-demo.ts) with two
# fictitious tenants — an artisan du bâtiment and an institut de beauté — so
# the app can be walked through with a prospect/investor on real-looking
# data, without touching a real artisan's database.
#
# Runs after `docker compose ... up --build -d`: retries a few times because
# the backend container's own entrypoint (entrypoint.dev.sh) is applying
# migrations and starting `nest start --watch` concurrently — the first
# compile of prisma/seed-demo.ts into dist/prisma/seed-demo.js can take a few
# seconds, and migrate deploy needs Postgres past its healthcheck first.
#
#   sh infra/demo-seed.sh
#   make demo
set -eu

COMPOSE="docker compose -f infra/docker-compose.yml -p facturele-demo"

RETRIES=20
DELAY=3

i=0
until $COMPOSE exec -T backend npx prisma migrate deploy >/dev/null 2>&1 &&
  $COMPOSE exec -T backend node dist/prisma/seed-demo.js; do
  i=$((i + 1))
  if [ "$i" -ge "$RETRIES" ]; then
    echo "demo-seed: backend still not ready after $((RETRIES * DELAY))s, giving up" >&2
    echo "demo-seed: check \`docker compose -f infra/docker-compose.yml -p facturele-demo logs backend\`" >&2
    exit 1
  fi
  echo "demo-seed: backend not ready yet, retrying in ${DELAY}s... ($i/$RETRIES)"
  sleep "$DELAY"
done

FRONTEND_PORT=4200
if [ -f infra/.env ]; then
  FRONTEND_PORT=$(grep -E '^FRONTEND_PORT=' infra/.env | cut -d= -f2)
  FRONTEND_PORT=${FRONTEND_PORT:-4200}
fi

echo ""
echo "Demo ready on http://localhost:${FRONTEND_PORT}"
echo "  Login page now shows one-click \"Démo — accès en un clic\" buttons (DEMO_MODE=true)."
echo "  Or type the credentials by hand:"
echo "    Artisan bâtiment (Bâti Rénov)          demo.artisan@facturele.app / DemoArtisan2026!"
echo "    Institut de beauté (L'Atelier Beauté)  demo.beaute@facturele.app / DemoBeaute2026!"
echo ""
echo "Run \`make demo-down\` when you're done — it destroys the demo database."
