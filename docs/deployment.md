# Deployment (OVH VPS)

FactureLeBat is deployed as a single Docker Compose stack on one OVH VPS — no orchestrator, no managed DB, no CDN. That matches the project's own priority order ([development-rules.md](development-rules.md): Reliability > Simplicity > Maintainability > Scalability > Performance): a single machine is simpler to operate and reason about than a multi-node setup, and this app has no scale requirement that justifies the extra moving parts yet. Revisit if/when Phase 13's multi-tenancy actually brings the traffic that would need it.

See [architecture.md](architecture.md#docker-infra) for what each container does. This doc is the operational how-to.

## Topology

```
Internet ──▶ Caddy (80/443, TLS) ──▶ Nginx (frontend) ──▶ Nest API (backend) ──▶ Postgres
```

Only `caddy` publishes ports to the host. `frontend`, `backend`, and `postgres` are reachable solely over the internal Compose network — the same "one entry point" posture as the app's own Controller → Service → Repository layering, just at the infra level.

## Prerequisites

- An OVH VPS (any tier — this app has no heavy resource needs) running a recent Debian/Ubuntu.
- [Docker Engine + the Compose plugin](https://docs.docker.com/engine/install/) installed on the VPS (`docker compose version` should work — this is the `docker compose` plugin, not the standalone `docker-compose` v1 binary).
- `git` installed on the VPS.
- A domain (or subdomain) with its `A`/`AAAA` record pointed at the VPS's public IP. Caddy cannot issue a certificate until this resolves.
- Firewall: allow `22` (SSH), `80`, and `443`; deny everything else. Postgres is never published in prod, so there's nothing else to open. With `ufw`:
  ```bash
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw enable
  ```

## First deploy

```bash
ssh <user>@<vps-ip>
git clone <repo-url> FactureLeBat && cd FactureLeBat
cp infra/.env.example infra/.env
```

Edit `infra/.env`:

- `POSTGRES_PASSWORD` — a strong, unique value. Never the `facturelebat` dev default.
- `DOMAIN` — the real domain, e.g. `DOMAIN=factures.example.com` (not the dev default `:80`).
- Everything else can keep its default unless you're also enabling Phase 10 (`GROQ_API_KEY`) or Phase 12 (`APP_ENCRYPTION_KEY`) — see `backend/.env.example` for what each does and how the app degrades (503 on the relevant routes) when left unset.

Then:

```bash
make prod
```

This builds the images, starts `postgres`/`backend`/`frontend`/`caddy`, applies pending Prisma migrations automatically (`backend/entrypoint.sh`), and has Caddy request its Let's Encrypt certificate as soon as it can reach `DOMAIN` on port 80. Give it a minute, then visit `https://<your-domain>`.

If the certificate doesn't show up:

```bash
docker compose -f infra/docker-compose.prod.yml logs caddy
```

The most common cause is DNS not having propagated yet, or port 80/443 not actually reachable from the internet (check the firewall).

## Redeploying (shipping a new version)

```bash
make deploy
```

This wraps `infra/deploy.sh`: `git pull --ff-only`, rebuild images, recreate containers. No separate migration step — the backend's own entrypoint applies pending migrations before it starts serving traffic (see [architecture.md](architecture.md#entrypoint-scripts-backend)). There is a brief backend restart window (single container, no blue/green) — acceptable for this app's scale per the priority order above; revisit only if that ever becomes a real problem.

## Rolling back

```bash
git checkout <previous-commit-or-tag>
make deploy
```

`prisma migrate deploy` is forward-only — it never runs a "down" migration. If the version you're rolling back *to* predates a schema change the version you're rolling back *from* introduced, rolling back the code alone leaves the database schema ahead of what that code expects. That situation needs a hand-written down-migration before `make deploy`; it isn't something `entrypoint.sh` can safely automate. In practice this should be rare — check whether the commit(s) being reverted touched `backend/prisma/migrations/` before assuming a plain rollback is safe.

## Backups

```bash
make backup
```

Wraps `infra/backup.sh`: `pg_dump`s the database, gzips it to `infra/backups/facturelebat_<timestamp>.sql.gz`, and deletes anything older than 14 days. `infra/backups/` is gitignored — these are local files on the VPS, not committed.

Automate it with a daily cron entry on the VPS:

```bash
crontab -e
# 3am daily
0 3 * * * cd /path/to/FactureLeBat && make backup >> /var/log/facturelebat-backup.log 2>&1
```

For real disaster-recovery coverage (surviving the VPS itself being lost, not just a bad deploy), copy `infra/backups/` off the machine periodically — e.g. an OVH Object Storage bucket via `rclone`, or a plain `scp`/`rsync` to another host. That transport is intentionally left to you to wire up (varies by what storage you already have); `infra/backup.sh` only owns "produce a good local dump."

### Restoring a backup

```bash
gunzip -c infra/backups/facturelebat_<timestamp>.sql.gz | \
  docker compose -f infra/docker-compose.prod.yml exec -T postgres \
  psql -U <POSTGRES_USER> <POSTGRES_DB>
```

Restoring into a database that already has data will conflict on primary keys — this is meant for restoring into a fresh `postgres_data` volume (disaster recovery), not merging into a live one.

## Logs

```bash
make logs                                                    # dev stack, all services
docker compose -f infra/docker-compose.prod.yml logs -f                  # prod, all services
docker compose -f infra/docker-compose.prod.yml logs -f backend          # prod, one service
```

The commands above are Docker's own log driver — they only go back as far as Docker's retention and disappear if a container is recreated. The backend also writes colored, leveled, rotated log files to a `backend_logs` named volume (`combined-YYYY-MM-DD.log`, everything; `error-YYYY-MM-DD.log`, failures only, kept longer) that survive restarts/redeploys independently of Docker's log driver:

```bash
make logs-files-prod    # tail -f the combined log
make logs-errors-prod   # tail -f the error-only log
```

For direct filesystem access without going through `docker compose exec` (e.g. to `scp` a log off the VPS), find the volume's real path with `docker volume inspect facturelebat-prod_backend_logs --format '{{ .Mountpoint }}'`. See [logging.md](logging.md) for the log format, levels, and how request ids let you trace one request across the whole log.

## Secrets

- `infra/.env` is gitignored and never committed — it's the only place `POSTGRES_PASSWORD`, `GROQ_API_KEY`, and `APP_ENCRYPTION_KEY` live in prod.
- `APP_ENCRYPTION_KEY` (Phase 12, SMTP password encryption) has no rotation path today: rotating it strands any already-encrypted SMTP password stored under the old key, since nothing decrypts-and-re-encrypts on rotation. If it ever needs to change, artisans with mail settings configured will need to re-enter their SMTP password afterward.
- Never publish `postgres` to the host in the prod Compose file — the whole point of routing everything through `caddy` is that it's the only thing an attacker on the internet can reach at all.

## Local smoke-testing of the prod images

`make prod` also works on a dev machine with `DOMAIN=:80` (the `infra/.env.example` default) — Caddy then just serves plain HTTP on `http://localhost` with no ACME attempt (Caddy only requests a certificate for a real hostname, never for a bare port). Useful for checking a prod build actually boots before pushing to the VPS, without needing a real domain pointed at your laptop.
