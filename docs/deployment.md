# Deployment (OVH VPS)

FactureLe is deployed as a single Docker Compose stack on one OVH VPS — no orchestrator, no managed DB, no CDN. That matches the project's own priority order ([development-rules.md](development-rules.md): Reliability > Simplicity > Maintainability > Scalability > Performance): a single machine is simpler to operate and reason about than a multi-node setup, and this app has no scale requirement that justifies the extra moving parts yet. Revisit if/when Phase 13's multi-tenancy actually brings the traffic that would need it.

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
git clone <repo-url> FactureLe && cd FactureLe
cp infra/.env.example infra/.env
```

Edit `infra/.env`:

- `POSTGRES_PASSWORD` — a strong, unique value. Never the `facturele` dev default.
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

## TLS: why there's no certbot, and how renewal is actually verified

HTTPS is entirely owned by the `caddy` service (see [Topology](#topology) above) — issuance and renewal are automatic and built into Caddy itself, driven purely by `DOMAIN` in `infra/.env`. **There is deliberately no certbot container**: it would either fight Caddy for the port 80 ACME challenge or sit completely unused, since `infra/docker-compose.prod.yml` already documents Caddy as the single owner of public exposure/TLS. Don't reintroduce one — if this gets re-proposed, it's re-litigating a decision already made in Phase 21.

**Security headers** (`infra/Caddyfile`): HSTS, a CSP fitted to exactly what this app's frontend loads (no CDN scripts, self-hosted fonts, Stripe/Google are full-page redirects not embedded SDKs, the PDF preview's `<iframe>` points at a client-side `blob:` URL), `X-Frame-Options`, and a `Permissions-Policy` disabling browser features the app never uses. The Caddyfile itself documents the reasoning for each CSP directive inline — read it before changing the CSP, since a directive that looks safe to tighten further (e.g. dropping `style-src`'s `'unsafe-inline'`) can silently break the tour overlay, manual-invoice column/row resize, or the line-marking badge, all of which set inline `style.*` via JS at runtime.

**Verifying renewal actually works, not just "Caddy claims to auto-renew":**

- Manual check any time: `echo | openssl s_client -servername <domain> -connect <domain>:443 2>/dev/null | openssl x509 -noout -enddate` — prints the live certificate's expiry. Caddy renews roughly a month before expiry, so a healthy deployment should never show less than ~30 days remaining except briefly around a renewal.
- `docker compose -f infra/docker-compose.prod.yml logs caddy | grep -i certificate` shows Caddy's own issuance/renewal log lines.
- **Certificate-expiry monitoring**: `infra/check-cert-expiry.sh` runs the same `openssl` check as above and emails an alert (via the Resend account already configured for Phase 17.5's system mail — `SYSTEM_SMTP_PASSWORD` doubles as a Resend API key, no new secret needed) if the live cert has fewer than `CERT_EXPIRY_WARN_DAYS` (default 14) days left, or if no certificate could be retrieved at all. Set `OPS_ALERT_EMAIL` in `infra/.env` to receive alerts; leave it unset to still get the check's finding in the cron log with no email. Schedule it on the VPS (not inside a container — it's a one-off ops probe, not part of the app):
  ```bash
  # crontab -e, on the VPS
  0 8 * * * cd /path/to/FactureLe && sh infra/check-cert-expiry.sh >> /var/log/facturele-cert-check.log 2>&1
  ```
- The `:80`-no-domain fallback (`infra/.env.example`'s `DOMAIN=:80` default, for local `make prod` smoke-testing — see below) can't reach production by accident: `infra/deploy.sh` refuses to run if `infra/.env`'s `DOMAIN` is empty or still `:80`.

## Backups

```bash
make backup
```

Wraps `infra/backup.sh`: `pg_dump`s the database, gzips it to `infra/backups/facturele_<timestamp>.sql.gz`, and deletes anything older than 14 days. `infra/backups/` is gitignored — these are local files on the VPS, not committed.

Automate it with a daily cron entry on the VPS:

```bash
crontab -e
# 3am daily
0 3 * * * cd /path/to/FactureLe && make backup >> /var/log/facturele-backup.log 2>&1
```

For real disaster-recovery coverage (surviving the VPS itself being lost, not just a bad deploy), copy `infra/backups/` off the machine periodically — e.g. an OVH Object Storage bucket via `rclone`, or a plain `scp`/`rsync` to another host. That transport is intentionally left to you to wire up (varies by what storage you already have); `infra/backup.sh` only owns "produce a good local dump."

### Restoring a backup

```bash
gunzip -c infra/backups/facturele_<timestamp>.sql.gz | \
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

For direct filesystem access without going through `docker compose exec` (e.g. to `scp` a log off the VPS), find the volume's real path with `docker volume inspect facturele-prod_backend_logs --format '{{ .Mountpoint }}'`. See [logging.md](logging.md) for the log format, levels, and how request ids let you trace one request across the whole log.

## Mobile app builds (iOS/Android, Phase 22)

Unlike everything else in this doc, building the mobile app happens on a developer's own Mac, not on the VPS — Xcode/Android Studio aren't part of the deploy pipeline, and the mobile shell has no server-side component of its own (it's the same Angular build, wrapped).

```bash
make ios       # builds the prod Angular bundle, cap syncs, opens Xcode
make android   # same, opens Android Studio
```

Both need `frontend/ios/`/`frontend/android/` (already committed) and, for push notifications to actually work, a real Firebase project's config files dropped in by hand — `google-services.json` in `frontend/android/app/`, and the Firebase iOS SDK added as a Swift Package dependency in Xcode (see [architecture.md](architecture.md#mobile-app-shell-frontendios-frontendandroid-phase-22) and [roadmap.md](roadmap.md) Phase 22's implementation notes). Pass `LOCAL_HOST=<your-lan-ip>` to either target to point the app at a backend running on your own machine instead of the real domain, for simulator/emulator testing:

```bash
make ios LOCAL_HOST=192.168.1.23
```

Store submission itself (developer accounts, App Store Connect/Play Console listings, review) is out of scope for what's built so far — see [roadmap.md](roadmap.md) Phase 22's non-goals and its store-compliance audit notes for what's already handled in code versus what's still an operational checklist item before actually submitting.

## Secrets

- `infra/.env` is gitignored and never committed — it's the only place `POSTGRES_PASSWORD`, `GROQ_API_KEY`, `APP_ENCRYPTION_KEY`, and `FIREBASE_SERVICE_ACCOUNT_JSON` live in prod.
- `FIREBASE_SERVICE_ACCOUNT_JSON` (Phase 22, base64-encoded Firebase service-account JSON) has the same "app boots fine without it" posture as `GROQ_API_KEY`: unset, `PushSenderService` just reports push notifications unavailable (503 on the admin test-send route; the daily reminder cron logs a warning and skips silently) until it's configured.
- `APP_ENCRYPTION_KEY` (Phase 12, SMTP password encryption) has no rotation path today: rotating it strands any already-encrypted SMTP password stored under the old key, since nothing decrypts-and-re-encrypts on rotation. If it ever needs to change, artisans with mail settings configured will need to re-enter their SMTP password afterward.
- Never publish `postgres` to the host in the prod Compose file — the whole point of routing everything through `caddy` is that it's the only thing an attacker on the internet can reach at all.

## Local smoke-testing of the prod images

`make prod` also works on a dev machine with `DOMAIN=:80` (the `infra/.env.example` default) — Caddy then just serves plain HTTP on `http://localhost` with no ACME attempt (Caddy only requests a certificate for a real hostname, never for a bare port). Useful for checking a prod build actually boots before pushing to the VPS, without needing a real domain pointed at your laptop.
