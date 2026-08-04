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
- **Certificate-expiry monitoring**: `infra/check-cert-expiry.sh` runs the same `openssl` check as above and emails an alert (over plain SMTP, using the `SYSTEM_SMTP_*` system mailbox already configured above, no new secret needed) if the live cert has fewer than `CERT_EXPIRY_WARN_DAYS` (default 14) days left, or if no certificate could be retrieved at all. Set `OPS_ALERT_EMAIL` in `infra/.env` to receive alerts; leave it unset to still get the check's finding in the cron log with no email. Schedule it on the VPS (not inside a container — it's a one-off ops probe, not part of the app):
  ```bash
  # crontab -e, on the VPS
  0 8 * * * cd /path/to/FactureLe && sh infra/check-cert-expiry.sh >> /var/log/facturele-cert-check.log 2>&1
  ```
- The `:80`-no-domain fallback (`infra/.env.example`'s `DOMAIN=:80` default, for local `make prod` smoke-testing — see below) can't reach production by accident: `infra/deploy.sh` refuses to run if `infra/.env`'s `DOMAIN` is empty or still `:80`.

## DDoS / bot protection (Cloudflare)

Not enabled by default — `DOMAIN` alone (a bare A/AAAA record at your registrar) works fine and is what [First deploy](#first-deploy) above describes. This section is for turning on Cloudflare's free plan in front of Caddy, recommended once the app has real users, since it absorbs volumetric/multi-vector (L3-L7) attacks before they ever reach the VPS — something no amount of app-level rate-limiting can do on its own.

`infra/Caddyfile` and `backend/src/main.ts` are already prepared for this (a `trusted_proxies` block listing Cloudflare's published edge ranges, and `app.set('trust proxy', 2)`) — turning Cloudflare on is a dashboard/DNS change, not a code change, except for the one `trust proxy` bump called out below.

1. Create a free account at [cloudflare.com](https://cloudflare.com) and add your domain.
2. At your registrar, replace the domain's nameservers with the two Cloudflare assigns you (takes anywhere from minutes to ~24h to propagate).
3. In Cloudflare's DNS tab, make sure the `A`/`AAAA` record pointing at the VPS is **proxied** (orange cloud, not grey) — this is what actually routes traffic through Cloudflare's edge instead of straight to the VPS.
4. SSL/TLS tab → set the mode to **Full (strict)**, not Flexible: Caddy already terminates real Let's Encrypt certs, so Cloudflare should verify the origin cert rather than trust any self-signed one. Flexible would mean Cloudflare-to-origin traffic goes over plain HTTP.
5. Security tab → Bots/WAF: the free plan includes Cloudflare's managed WAF ruleset and basic bot-fight mode — turn both on. If under an active attack, the Security tab's "I'm Under Attack Mode" adds a JS challenge in front of every request; only use it while actively firefighting, since it adds friction for real visitors too.
6. In `backend/src/main.ts`, change `app.set('trust proxy', 2)` to `app.set('trust proxy', 3)` (Cloudflare is now an extra hop before Caddy) and redeploy (`make deploy`). Skipping this step doesn't break traffic, but it does silently key the login/forgot-password rate limits off Cloudflare's edge IP instead of real visitor IPs — the same shared-bucket problem `trust proxy` was added to avoid in the first place.
7. Sanity check after switching: `curl -sI https://<your-domain>` should show Cloudflare's `cf-ray` response header, and `docker compose -f infra/docker-compose.prod.yml logs backend` on a fresh request should log the real visitor IP, not one of Cloudflare's ranges.

Firewall rules stay as-is (step in [Prerequisites](#prerequisites)) — Cloudflare proxying doesn't change what's open on the VPS itself, it just means most attack traffic never gets that far. Optionally, once confident DNS is stable, you can further restrict the VPS firewall to only accept 80/443 from Cloudflare's published ranges (same list as `infra/Caddyfile`'s `trusted_proxies`) to stop anyone from bypassing Cloudflare by hitting the VPS's IP directly — not done by default here since it makes debugging (`curl` straight to the VPS) harder and isn't needed for the WAF/DDoS protection itself to work.

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
make logs                # dev stack, all services
make logs-prod           # prod, all services
make logs-backend-prod   # prod, one service at a time
make logs-frontend-prod
make logs-caddy-prod
make logs-postgres-prod
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

### Native Google Sign-In (Android)

The login page's "Continuer avec Google" button never uses the backend's browser-redirect `/auth/google` flow inside the app shell — Google actively blocks that redirect from completing inside an embedded WebView. Instead, the native build signs in via Android's Credential Manager (`GoogleNativeLoginService`, `@capgo/capacitor-social-login`), which hands a Google-signed ID token straight to `AuthService.googleTokenLogin` for the backend to verify (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` in `infra/.env` — same env vars the web flow already uses, no new ones). This needs its own one-time Google Cloud Console setup, separate from `infra/.env`:

1. **Reuse the existing Web OAuth client.** Google Cloud Console → APIs & Services → Credentials → your **Web application** client (the one whose ID/secret are already `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`). Copy its client ID — it's not secret (unlike the client secret), so it's safe to embed in the app.
2. **Set that client ID in the frontend build.** `frontend/src/environments/environment.prod.ts`'s `googleWebClientId` ships as a placeholder (`REPLACE_WITH_GOOGLE_WEB_CLIENT_ID`) — edit it to the value from step 1 before running `make android`/`make android-prod`. This is what makes the native SDK mint ID tokens whose `aud` claim matches what the backend verifies.
3. **Create a new Android OAuth client**, in the *same* Google Cloud project as the Web client (Credentials → Create Credentials → OAuth client ID → Android):
   - Package name: `fr.facturele.app` (must match `applicationId` in `frontend/android/app/build.gradle` exactly).
   - SHA-1 certificate fingerprint — see below. **Do not** put this client's ID anywhere in app config; Google matches it purely by package name + SHA-1, invisibly, at sign-in time.
4. **Register the right SHA-1(s).** A build only works if its actual signing certificate's SHA-1 is registered:
   - Debug builds (`make android-dev`, Android Studio's default Run): `cd frontend/android && ./gradlew signingReport`.
   - A signed release APK/AAB you install directly: `keytool -printcert -jarfile app-release.apk`.
   - **Play Store installs — the one that matters for the reviewer/real users**: Play Console → your app → Setup → **App integrity** → **App signing key certificate**, copy its SHA-1. This is Google Play's own re-signing certificate, not `facturele-release.jks`'s — required even if the upload-key SHA-1 is already registered, since that's not the certificate installed on end-user devices once Play App Signing has re-signed the bundle.
5. **OAuth consent screen** (Console → OAuth consent screen): must be **External** (Internal blocks regular `@gmail.com` accounts, including your own test account). If it's still in **Testing** mode, add every Google account you test with under Audience → Test users — publishing to Production isn't required just for the `email`/`profile` scopes this app requests.

No Digital Asset Links (`assetlinks.json`) step is needed for this — that file already exists for an unrelated purpose (Phase 29's referral deep links) and Credential Manager doesn't use it. Console changes can take a few hours to propagate; a device restart alone isn't enough. If sign-in fails with `[28444] Developer console is not set up correctly` or `[16] Account reauth failed`, `node_modules/@capgo/capacitor-social-login/README.md`'s own troubleshooting section (search "Android troubleshooting") walks through the exact package-name/SHA-1/webClientId checklist — read the failing device's Logcat filtered on `GoogleProvider` first, it logs the package name and SHA-1 the app actually presented.

**Installing straight onto an emulator/simulator**, instead of opening Xcode/Android Studio and hitting Run by hand:

```bash
make android-dev [LOCAL_HOST=192.168.1.23]   # backend on your machine, auto-detects LAN IP if omitted
make android-prod                            # real API domain (facturele.net)
make ios-dev [LOCAL_HOST=192.168.1.23]
make ios-prod
```

These (`frontend/scripts/run-android.sh`/`run-ios.sh`) build a release-configuration artifact and `adb install`/`xcrun simctl install` it directly, then launch it — closer to "as if it came from the store" than `make ios`/`android` (which still open the IDE): a real app icon, no dev server or debugger attached. Two things worth knowing:

- Android's `release` build type is signed with Gradle's auto-generated debug keystore (`frontend/android/app/build.gradle`) — fine for sideloading onto an emulator, but not a store-distribution signature. A real release keystore needs generating before ever uploading to the Play Store (see the comment there).
- The `*-dev` modes temporarily uncomment the same cleartext/ATS exceptions `LOCAL_HOST=` needs above (`AndroidManifest.xml`+`network_security_config.xml`, `Info.plist`), fill in your LAN IP, build, then revert those files via `git checkout` on exit — so nothing ends up committed uncommented. This requires `frontend/android/app/src/main/AndroidManifest.xml`, its `network_security_config.xml`, and `frontend/ios/App/App/Info.plist` to be clean (no uncommitted changes) before running; commit or stash first if they aren't.

Store submission itself (developer accounts, App Store Connect/Play Console listings, review) is out of scope for what's built so far — see [roadmap.md](roadmap.md) Phase 22's non-goals and its store-compliance audit notes for what's already handled in code versus what's still an operational checklist item before actually submitting.

## Secrets

- `infra/.env` is gitignored and never committed — it's the only place `POSTGRES_PASSWORD`, `GROQ_API_KEY`, `APP_ENCRYPTION_KEY`, and `FIREBASE_SERVICE_ACCOUNT_JSON` live in prod.
- `FIREBASE_SERVICE_ACCOUNT_JSON` (Phase 22, base64-encoded Firebase service-account JSON) has the same "app boots fine without it" posture as `GROQ_API_KEY`: unset, `PushSenderService` just reports push notifications unavailable (503 on the admin test-send route; the daily reminder cron logs a warning and skips silently) until it's configured.
- `APP_ENCRYPTION_KEY` (Phase 12, SMTP password encryption) has no rotation path today: rotating it strands any already-encrypted SMTP password stored under the old key, since nothing decrypts-and-re-encrypts on rotation. If it ever needs to change, artisans with mail settings configured will need to re-enter their SMTP password afterward.
- Never publish `postgres` to the host in the prod Compose file — the whole point of routing everything through `caddy` is that it's the only thing an attacker on the internet can reach at all.

## Local smoke-testing of the prod images

`make prod` also works on a dev machine with `DOMAIN=:80` (the `infra/.env.example` default) — Caddy then just serves plain HTTP on `http://localhost` with no ACME attempt (Caddy only requests a certificate for a real hostname, never for a bare port). Useful for checking a prod build actually boots before pushing to the VPS, without needing a real domain pointed at your laptop.
