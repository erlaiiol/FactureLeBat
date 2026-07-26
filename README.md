# FactureLe

Invoice generator built primarily for independent construction artisans (flooring, electrical, plumbing, drywall...) — the most obvious target, though the platform is growing into a broader small-business tool. An artisan can fill in their business profile, save reusable customers and catalog materials (including importing product data straight from a supplier's product page), create an invoice — priced either by surface area (m², with an optional +10%/+20% material margin for offcuts) or by unit count — and download it as a PDF.

Phases 1-5 of the roadmap are done (see [docs/roadmap.md](docs/roadmap.md) for what's next):

- **Invoices** — surface-area or unit-count line pricing, sequential/gapless numbering, server-computed totals, PDF export.
- **Customers** — saved records, searchable; a saved customer is a one-shot autofill on the invoice form (never a lock — every field stays editable), and the artisan can save a freshly-typed customer for next time.
- **Products** — a searchable material catalog (name, price, unit, supplier).
- **Smart import** — paste a supplier product page URL and the product form prefills itself (name/price/unit/description/supplier), extracted from the page's structured data (`schema.org`/Open Graph). The fetch is SSRF-hardened: it refuses to connect to loopback/private/link-local/cloud-metadata addresses, validated at the exact moment the connection opens (not a separate check beforehand) so a DNS-rebinding attack can't slip through.
- **Services & flexible pricing** — a searchable catalog of non-material work (labor, expertise, misc charges), addable to an invoice either as its own visible line or as a hidden amount redistributed into the other lines (evenly, or with artisan-set per-line weights). Redistribution is integer-cents only, with the rounding remainder assigned deterministically — no cents lost or invented, and the invoice's displayed total always increases by exactly the service amount, in both modes.

No authentication yet — this is a single-artisan tool today (see [docs/roadmap.md](docs/roadmap.md) for what multi-tenant would need).

## Stack

- **Backend**: NestJS 11, Prisma 7 (driver adapters, PostgreSQL), TypeScript, Jest
- **Frontend**: Angular (standalone components, signals, `OnPush`), Tailwind CSS
- **Database**: PostgreSQL 16
- **Infra**: Docker Compose (separate dev/prod topologies), Nginx (prod static + reverse proxy)

## Prerequisites

- Docker Desktop (or Docker Engine + Compose v2) — the only hard requirement to run the app
- Node.js 24+ and npm — only needed for native (non-Docker) development or running tests/lint locally
- `make` (preinstalled on macOS/Linux; on Windows use the raw `docker compose` commands from the Makefile directly)

## Quickstart (Docker, recommended)

```bash
git clone <repo-url> && cd FactureLe
cp infra/.env.example infra/.env      # dev defaults work out of the box
cp backend/.env.example backend/.env  # only read for native dev, but cheap to have

make dev
```

On first run, once the containers are up, apply the database schema in a second terminal:

```bash
make migrate
```

Then open:

- **App**: http://localhost:4200
- **API**: http://localhost:3000/api (try http://localhost:3000/api/health)

Fill in **Mon entreprise** first (your business profile drives VAT on future invoices), then **Nouvelle facture**. Tail logs from all containers at any point with `make logs`.

Stop everything with `make down`.

## Quickstart (native, no Docker)

Useful for a faster inner dev loop — Docker file-watching can be slow on macOS. Still needs Postgres from Docker:

```bash
docker compose -f infra/docker-compose.yml up -d postgres

cd backend && npm install && npx prisma generate && npx prisma migrate dev
npm run start:dev   # http://localhost:3000

# in another terminal
cd frontend && npm install
npx ng serve        # http://localhost:4200
```

## Production mode

```bash
make prod
```

Builds optimized images (compiled Nest `dist/`, static Angular build served by Nginx with `/api/*` proxied to the backend, same origin — no CORS needed) and starts everything detached, behind a Caddy container that terminates TLS. Pending migrations are applied automatically on backend container start (`backend/entrypoint.sh`). The backend shuts down gracefully on `docker stop` (`app.enableShutdownHooks()` — Postgres connections and pooled HTTP connections are closed cleanly, not killed mid-request). See [docs/architecture.md](docs/architecture.md#docker-infra) for the dev/prod topology.

With the default `infra/.env` (`DOMAIN=:80`), this is a local smoke test: open **http://localhost**. Deploying for real (a domain, a real TLS cert, an OVH VPS) is [docs/deployment.md](docs/deployment.md) — `DOMAIN` is the one setting that turns this from "local prod smoke test" into "real internet-facing deployment."

> `make dev` publishes `BACKEND_PORT`/`FRONTEND_PORT`/`POSTGRES_PORT` to the host; `make prod` only publishes `80`/`443` (via Caddy) — `postgres`/`backend`/`frontend` aren't reachable from the host at all in prod. The two stacks don't share ports, so running both at once is fine; they're still fully separate Compose projects (`facturele-dev`/`facturele-prod`) with their own containers and Postgres volume either way.

## Project structure

```
backend/    NestJS API — see docs/architecture.md and docs/conventions.md
frontend/   Angular SPA
infra/      Docker Compose files, Nginx/Caddy config, shared .env, deploy.sh/backup.sh
postgres/   init.sql (intentionally a no-op — schema is Prisma-managed, see docs/database.md)
docs/       architecture, conventions, database, API reference, deployment, roadmap
```

## Common commands

**Backend** (`cd backend`):

```bash
npm run start:dev   # dev server, hot reload
npm run lint         # eslint
npm test             # unit tests
npm run test:cov     # unit tests with coverage
npm run test:e2e     # e2e tests (needs a reachable Postgres with migrations applied)
npm run build         # compile to dist/
```

**Frontend** (`cd frontend`):

```bash
npx ng serve   # dev server
npx ng test     # unit tests
npx ng build    # production build
```

**Database** (`cd backend`):

```bash
npx prisma migrate dev --name <description>   # create + apply a migration (dev)
npx prisma studio                              # browse data
```

E2E tests run against the real local dev Postgres rather than a mocked/isolated one (see [docs/conventions.md](docs/conventions.md)) — they clean up every row they create, so `npm run test:e2e` is safe to run repeatedly without accumulating test data.

## Documentation

- [docs/architecture.md](docs/architecture.md) — system overview, request flows, module layout
- [docs/conventions.md](docs/conventions.md) — coding conventions actually enforced in this codebase (money handling, validation, concurrency/resource-lifecycle rules, SSRF defenses, testing priorities...)
- [docs/database.md](docs/database.md) — schema, Prisma 7 specifics, invoice numbering, migrations
- [docs/api.md](docs/api.md) — endpoint reference
- [docs/development-rules.md](docs/development-rules.md) — the non-negotiable rules (layering, money-as-cents, testing priorities...)
- [docs/deployment.md](docs/deployment.md) — deploying to a real OVH VPS: TLS, redeploys, backups, rollback
- [docs/roadmap.md](docs/roadmap.md) — product vision and phased plan
