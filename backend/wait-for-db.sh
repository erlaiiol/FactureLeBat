#!/bin/sh
# Blocks until the host:port encoded in DATABASE_URL accepts a TCP connection.
#
# depends_on: condition: service_healthy (infra/docker-compose*.yml) only gates
# the initial `docker compose up` — it is not re-evaluated when a single
# container restarts on its own (crash, `restart: unless-stopped` after a VPS
# reboot, etc.), so the backend can otherwise come up before Postgres is
# actually ready to accept connections. Sourced by entrypoint.sh and
# entrypoint.dev.sh rather than duplicated in both.
set -eu

RETRIES=30
DELAY=2

i=0
until node -e "
  const { hostname, port } = new URL(process.env.DATABASE_URL);
  require('node:net')
    .createConnection({ host: hostname, port: Number(port) || 5432 })
    .on('connect', function () { this.end(); process.exit(0); })
    .on('error', function () { process.exit(1); });
"; do
  i=$((i + 1))
  if [ "$i" -ge "$RETRIES" ]; then
    echo "wait-for-db: database still unreachable after $((RETRIES * DELAY))s, giving up" >&2
    exit 1
  fi
  echo "wait-for-db: database not ready yet, retrying in ${DELAY}s... ($i/$RETRIES)"
  sleep "$DELAY"
done

echo "wait-for-db: database is up"
