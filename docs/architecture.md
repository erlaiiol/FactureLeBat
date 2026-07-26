# Architecture

## System overview

```
┌─────────────────┐        /api/*  (JSON)        ┌──────────────────┐        ┌────────────┐
│  Angular SPA     │ ───────────────────────────▶ │  NestJS API       │ ─────▶ │ PostgreSQL │
│  (frontend/)      │ ◀─────────────────────────── │  (backend/)        │ ◀───── │            │
└─────────────────┘                              └──────────────────┘        └────────────┘
```

- **Dev**: the Angular dev server (`ng serve`, port 4200) calls the Nest API directly on `localhost:3000` — CORS is enabled backend-side for that origin.
- **Prod**: Nginx serves the compiled Angular bundle and reverse-proxies `/api/*` to the backend container on the same origin — no CORS needed. See `infra/nginx.conf`. In front of Nginx, a Caddy container is the app's only publicly-exposed service: it terminates TLS (automatic Let's Encrypt certs, HTTP→HTTPS redirect, renewal — all built into Caddy, no certbot dance needed) and reverse-proxies everything to Nginx. Nginx and the backend are not published to the host at all in prod — Caddy is the single entry point. See `infra/Caddyfile` and [deployment.md](deployment.md) for the target topology (a single OVH VPS running the whole stack via Docker Compose).

The backend is the single source of truth for all business logic (calculations, validation, numbering). The frontend never re-implements pricing rules except for a clearly-marked, non-authoritative live preview (see [conventions.md](conventions.md#no-business-logic-duplication)).

## Backend (`backend/`)

NestJS, layered strictly as **Controller → Service → Repository → Prisma**. Each domain is a self-contained module under `src/`:

```
src/
  common/          health check; unit.util.ts — the fixed Unit vocabulary (Phase 7)
                   shared by product/ and invoice/, so it isn't owned by either domain
  config/          env var validation (fails fast at boot on misconfiguration)
  database/        PrismaService (global, injectable everywhere)
  company/         singleton artisan profile
  customer/        saved customers (CRUD + search), same shape as company/
  product/         material catalog (CRUD + search), same shape as company/
    import/        supplier-URL import (Phase 4) — network I/O isolated from HTML parsing
      ip-guard.ts                 pure fn: is this IP loopback/private/link-local/metadata? (unit-tested directly)
      safe-fetcher.service.ts     SSRF-safe fetch: DNS-validated at connect time, bounded size/time/redirects
      product-extraction.service.ts  pure: HTML string -> best-effort draft (JSON-LD / Open Graph / <title>)
      product-import.service.ts   orchestration only, mirrors invoice.service.ts's role
  service-catalog/ non-material work catalog (Phase 5) — CRUD + search, same shape as product/
                   (named service-catalog, not service, to avoid a ServiceService class name
                   stuttering against NestJS's own "service" layering term)
  onboarding/      Phase 8 tour state (tourEnabled/completedTours) — a thin module of its
                   own reading/writing two columns on the Company singleton, kept out of
                   company/ so its GET/PATCH never has to go through CompanyController's
                   full-replace UpdateCompanyDto
  push-notification/  Phase 22 mobile push: PushDevice registration (artisan-facing),
                   admin device list/test-send (folded into AdminController), FCM sending
                   isolated in push-sender.service.ts (same "isolate the risky external
                   boundary" split as stripe-client.service.ts), and the codebase's first
                   scheduled job (ReminderCronService, @nestjs/schedule) — a daily digest
                   push for invoices that are late or still unpaid
  invoice/         the core domain
    calculation/   pure, dependency-free pricing math (InvoiceCalculationService), including
                   Phase 5's weighted redistribution split (computeWeightedSplit)
    dto/           class-validator input contracts, including Phase 5's service-line
                   cross-field validators (service-line-visibility-consistency.validator.ts,
                   service-line-weights-match-lines.validator.ts) and Phase 9.5's manual/
                   subfolder (create-manual-table.dto.ts and its column/row DTOs +
                   validators) plus manual-mode-fields-consistency.validator.ts, which
                   enforces entryMode GUIDED/MANUAL mutual exclusivity on CreateInvoiceDto
    manual/        Phase 9.5: manual-cell-parser.util.ts (parses a free-text cell into a
                   Decimal) and manual-table-calculation.util.ts (computeManualRowTotalCents,
                   reused by both the persisted-read and not-yet-saved preview paths — same
                   role as redistribution.util.ts's expandServiceLineWeights)
    entities/      API response shapes (decoupled from Prisma's generated types)
    pdf/           PDF rendering (pdfmake), isolated from persistence/business logic
    invoice.mapper.ts     Prisma row -> API response / PDF data (response shaping only) —
                          also where a Phase 5 REDISTRIBUTED service line's weighted split
                          into the invoice's own lines actually happens, computed fresh on
                          every read, never persisted
    invoice.service.ts    orchestration only
    invoice.repository.ts Prisma calls only
```

**Why this split matters in practice**: `InvoiceService` never touches Prisma directly and never computes a total — it asks `InvoiceRepository` to persist, `InvoiceMapper` to shape the response, and (transitively, via the mapper) `InvoiceCalculationService` to do the math. Each of those can be unit-tested — or replaced — without touching the others. `InvoiceCalculationService` in particular has no NestJS or Prisma dependency at all; it's plain TypeScript, which is why it has the most thorough test suite in the codebase (see `invoice-calculation.service.spec.ts`).

### Service lines (Phase 5)

A `Service` (`service-catalog/`) is a catalog entry mirroring `Product`, minus the supplier fields, plus a `defaultVisibility`. Adding one to an invoice creates an `InvoiceServiceLine` — a soft reference to the `Service` (same "autofill, not a lock" rule as `Invoice.customerId`) with its own snapshotted `name`/`description`/`amountCents`:

- **`VISIBLE`**: rendered as its own entry in the invoice's `serviceLines` response array and its own table on the PDF ("Prestations") — deliberately *not* merged into the `lines` array, since a service has no quantity/unit/waste-surcharge dimension to fit that shape.
- **`REDISTRIBUTED`**: never appears on its own. Instead, an `InvoiceServiceLineWeight` row per targeted `InvoiceLine` stores an artisan-set weight (an `EQUAL` split is simply a weight of `1` on every line, expanded at creation time — see `InvoiceService.create`). `InvoiceMapper.toInvoiceWithTotals()` calls `InvoiceCalculationService.computeWeightedSplit()` on every read to turn those weights into cents, folding each share directly into that line's displayed `lineTotalExclVatCents`. Nothing about the split itself is persisted — same "derived data is never persisted" rule as invoice totals (see [conventions.md](conventions.md)).

Both modes share the same invariant: the invoice's displayed total increases by exactly the service's `amountCents`, whichever mode is used.

### Units and calculation mode (Phase 7)

`InvoiceLine.unit` and `Product.unit` are both the same fixed `Unit` enum (`SQUARE_METER`, `LINEAR_METER`, `UNIT`, `LUMP_SUM`, `HOUR`, `DAY`, `KILOGRAM`, `LITER`, `CUBIC_METER`) instead of free text — the artisan picks one from a dropdown, never types it. The old AREA/UNIT `mode` field is gone entirely: `common/unit.util.ts`'s `isAreaUnit(unit)` (true only for `SQUARE_METER`) is the single source of truth `InvoiceCalculationService.computeLineTotal()`, the `WasteSurchargeOnlyForArea` DTO validator, and `InvoiceMapper` all derive the old mode distinction from, computed fresh every time rather than accepted as separate client input or persisted as its own column — the same "derived data is never persisted" rule as invoice totals. `UNIT_LABELS` in the same file maps each enum value to its French display string (`SQUARE_METER` → `"m²"`); `InvoiceMapper` applies it only when building PDF data, so `PdfService` stays ignorant of the enum, and JSON API responses keep returning the raw enum value like every other enum field.

### Onboarding tour state (Phase 8)

`Company.tourEnabled`/`Company.completedTours` (a `String[]` of tour ids) back the frontend's onboarding tour — see the Phase 8 roadmap notes for why they live on the singleton `Company` row rather than a new per-user table. `OnboardingRepository` reuses `company/company.constants.ts`'s `DEFAULT_COMPANY_PROFILE` for the same "PATCH can legitimately be the first write" upsert reasoning as `CompanyRepository`, since onboarding state can be touched before any `Company` profile GET/PATCH ever happens. Phase 9.5 adds a fourth tour id, `invoice-creation-manual`, to the fixed set both `backend/src/onboarding/onboarding.constants.ts` and the frontend's `onboarding.model.ts` mirror.

### Manual invoice mode (Phase 9.5)

`Invoice.entryMode` (`GUIDED` default, or `MANUAL`) decides which of two independent bodies a given invoice has: `GUIDED` uses `lines`/`serviceLines` exactly as before; `MANUAL` uses `manualColumns`/`manualRows` (each row's cells keyed by column id) and leaves `lines`/`serviceLines` empty. Every place that reads an invoice branches on this field:

- `InvoiceMapper.toInvoiceWithTotals()`/`toPdfData()`/`toPreviewPdfData()` each have a `GUIDED` path (unchanged) and a `MANUAL` path (`toManualInvoiceWithTotals`/`toManualPdfData`/`toManualPreviewPdfData`) that prices every row via `manual/manual-table-calculation.util.ts`'s `computeManualRowTotalCents` — this treats a manual row as a plain `UNIT`-mode `InvoiceLine` (quantity × unit price, no waste surcharge/packaging), so `InvoiceCalculationService` itself needed zero changes.
- `InvoiceRepository.createWithSequentialNumber()` creates `manualColumns` nested inside the same `invoice.create()` call as `lines` (so cells can reference the generated column ids afterward), then creates each `manualRow` + its cells in a second pass — the same two-phase shape Phase 5's service-line weights already established (create the parent row(s) first, then rows that reference their generated ids).
- `PdfService` branches its table-building step on `data.entryMode`: `buildLinesTable`/`buildServiceLinesTable` for `GUIDED`, `buildManualTable` for `MANUAL` (arbitrary artisan-defined columns plus a synthetic trailing "Total" column it formats itself — every other cell is rendered exactly as stored, since "Mettre en forme" is a frontend-only convenience, not a backend guarantee).

**Frontend**: `factures/nouvelle` is now a mode-choice screen (`InvoiceCreateModeChoicePage`) with two children — `rapide/` (the pre-existing shell + `client`/`lignes` steps, just moved one path segment deeper, otherwise unchanged) and `manuel/` (`InvoiceCreateManualPage`, a single page, no sub-routes). Mode manuel has its own `ManualInvoiceDraftStore` (`providedIn: 'root'`, own `localStorage` key) — deliberately not a variant of `InvoiceDraftStore`, since mode switching mid-draft is unsupported and the two bodies don't share a shape. Column/row drag-resize is `interact.js`'s `draggable()` wrapped in a small reusable `ManualResizeHandleDirective` that emits a raw pixel delta; the store clamps and owns the actual size, `interact.js` never touches invoice data.

### Request flow: creating an invoice

1. `POST /api/invoices` hits `InvoiceController`, which only deserializes/validates the body (`CreateInvoiceDto`, enforced globally by `ValidationPipe`) and calls `InvoiceService.create()`.
2. `InvoiceService` loads the (singleton) company profile via `CompanyService`, derives whether VAT applies (`isVatApplicable(legalStatus)`), confirms `customerId` exists via `CustomerService` if one was submitted (without ever overwriting the request's own customer fields — see [conventions.md](conventions.md)), and asks `InvoiceRepository.createWithSequentialNumber()` to persist.
3. The repository runs one Prisma **interactive transaction**: it increments `Company.nextInvoiceNumber` (the `UPDATE` takes a row lock, serializing concurrent creates — see [database.md](database.md#invoice-numbering)) and creates the `Invoice` + `InvoiceLine` rows in the same transaction.
4. `InvoiceService` hands the persisted row to `InvoiceMapper.toInvoiceWithTotals()`, which calls `InvoiceCalculationService` once per line and returns the full response — **no total is ever stored**; it's recomputed on every read.
5. `GET /api/invoices/:id/pdf` follows the same path up to `InvoiceMapper.toPdfData()`, then hands a plain data object to `PdfService` (isolated: it knows nothing about Prisma or business rules, only how to lay out a document — see `pdf.service.ts`).

### Request flow: previewing a draft invoice's PDF (Phase 6)

`POST /invoices/preview` takes the same `CreateInvoiceDto` as a real create, but never touches Prisma beyond reading the (already-loaded) company profile — nothing is persisted, so the artisan can preview at any point before saving:

1. `InvoiceController.previewPdf()` validates the body with the same `CreateInvoiceDto` as `create()`, then calls `InvoiceService.previewPdf()`.
2. `InvoiceService.previewPdf()` loads the company profile and hands both to `InvoiceMapper.toPreviewPdfData()` — deliberately skips `create()`'s `customerId`/`serviceId` existence checks, since nothing is persisted and a stale id can't corrupt any stored data.
3. `toPreviewPdfData()` runs `InvoiceCalculationService` positionally over `dto.lines`/`dto.serviceLines` (no persisted ids exist yet) instead of over persisted rows, reusing the same `expandServiceLineWeights` redistribution rule `create()` uses, so the two paths can never compute a different total for the same input. The result's `number` field is the literal placeholder `'BROUILLON'`, never a real allocated number.
4. `PdfService` renders it exactly like a real invoice's PDF — it has no idea the data didn't come from a persisted row.

### Request flow: importing a product from a supplier URL (Phase 4)

`POST /api/products/import` never touches Prisma — it's the one endpoint in the backend whose entire job is to make an outbound network call on the artisan's behalf, so its risk profile is different from everything else here and it's isolated accordingly:

1. `ProductController.importFromUrl()` validates the body (`ImportProductDto` — must be a well-formed `http(s)` URL) and delegates to `ProductImportService`, the only orchestrator involved.
2. `SafeFetcherService.fetchHtml()` does the risky part: it resolves DNS itself via a custom lookup function and rejects the request if any resolved address is loopback/private/link-local/cloud-metadata — critically, this validated address is the *same* one handed to the actual TCP connector (via undici's `Agent.connect.lookup`), which is what closes the DNS-rebinding gap a naive "check then fetch" would leave open (see `ip-guard.ts`/`safe-fetcher.service.ts` and [api.md](api.md#post-productsimport-phase-4)). Redirects are bounded and re-validated the same way; response size, timeout, and content-type are all capped.
3. `ProductExtractionService.extract()` — pure, no I/O — parses the fetched HTML with `cheerio`, preferring `schema.org/Product` JSON-LD, falling back to Open Graph tags, then `<title>`, sanitizing and length-clamping every field.
4. The result is a `ImportedProductDraft`, never written to `Product` — the frontend prefills the (still fully editable) product form with it, and only a subsequent, separate `POST /api/products` call — same one used for manual entry — actually persists anything.

### Cross-cutting concerns (`main.ts` / `app.module.ts`)

- **Env validation**: `ConfigModule.forRoot({ validate: validateEnv })` — the app refuses to boot if `DATABASE_URL` is missing/malformed, `PORT` isn't a valid port, etc. See `src/config/env.validation.ts`.
- **Security headers**: `helmet()` middleware.
- **Rate limiting**: `@nestjs/throttler`, global guard, 100 req/min/IP by default; `POST /products/import` overrides this to a tighter 10 req/min/IP via `@Throttle()` since it triggers a real outbound HTTP request per call.
- **Input validation**: global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` — every DTO field is validated and coerced; unknown fields are rejected outright.
- **API prefix**: everything is served under `/api` (`app.setGlobalPrefix('api')`) — this is what lets Nginx route `/api/*` to the backend and everything else to the static frontend in prod.
- **Graceful shutdown**: `app.enableShutdownHooks()` — without it, Nest never listens for `SIGTERM`/`SIGINT`, so `OnModuleDestroy` hooks (`PrismaService` disconnecting, `SafeFetcherService` closing its pooled `undici.Agent`) would only ever run when a test calls `app.close()` directly, never on a real `docker stop`/redeploy.
- **Logging**: Winston (`nest-winston`) replaces Nest's default console logger app-wide — colored, leveled, request-correlated (`x-request-id` via `AsyncLocalStorage`), written to both the console and rotated files under `backend/logs/`. A global exception filter (`AllExceptionsFilter`) and an HTTP request-logging middleware make sure every request and every uncaught error is logged, not just what individual services choose to log. See [logging.md](logging.md).
- **Scheduling**: `ScheduleModule.forRoot()` (`@nestjs/schedule`), added in Phase 22 for `ReminderCronService`'s daily push digest — the first scheduled job in this codebase. Runs in-process in the single backend container; would need a distributed lock or a dedicated scheduler only if the backend is ever scaled to multiple replicas.

## Frontend (`frontend/`)

Angular (standalone components, no NgModules), signals for local state, `OnPush` everywhere, Tailwind CSS for styling.

```
src/app/
  core/
    models/      TypeScript types mirroring backend DTOs/response shapes
    services/    thin HttpClient wrappers (one per backend domain)
  features/
    invoice-create/   the invoice creation flow: mode-choice/ (Phase 9.5) is the
                      first screen under factures/nouvelle, offering mode rapide
                      (Phase 6's shell — invoice-create-shell.page hosting two
                      routed steps, customer-step/ and lines-step/, now under
                      factures/nouvelle/rapide/ — plus invoice-draft.store.ts, a
                      shared providedIn:'root' store persisted to localStorage)
                      or mode manuel (manual/ — InvoiceCreateManualPage, a
                      single page with its own ManualInvoiceDraftStore and own
                      localStorage key; mode switching mid-draft is unsupported,
                      so the two stores never interact)
    invoice-list/     list + PDF download
    customer-list/    saved customers, search
    customer-form/    create/edit a customer (one page, keyed off a route id param)
    product-list/     material catalog, search
    product-form/     create/edit a product (one page, keyed off a route id param);
                      create mode also offers "import from supplier URL" (Phase 4)
    service-list/     service catalog (Phase 5), search — same shape as product-list/
    service-form/     create/edit a service (Phase 5) — same shape as product-form/,
                      minus the import step, plus a default-visibility selector
    company-settings/ singleton artisan profile editor — also hosts the Phase 8
                      "Visites guidées" toggle and "Rejouer les visites guidées" button
  shared/
    components/  small reusable presentational components (e.g. app-big-button,
                 app-field-hint — the Phase 7 persistent under-field tooltip)
    pipes/       e.g. centsToEuros, unitLabel (Unit enum -> French display string)
    tour/        Phase 8 onboarding tour engine, hand-built (no third-party tour
                 library, same precedent as app-field-hint): tour-definitions.ts
                 declares the four mini-tours' steps (Phase 9.5 adds
                 'invoice-creation-manual', route-mapped to factures/nouvelle/manuel
                 ahead of the general factures/nouvelle prefix in ROUTE_TOUR_MAP so
                 the more specific prefix wins); TourService
                 (providedIn: 'root') is the single source of truth for tour
                 state, auto-launching a tour on first visit to its section and
                 walking it (including cross-route steps) via the router;
                 TourAnchorDirective/TourAnchorRegistryService let any element
                 opt into being spotlighted by a stable id regardless of which
                 routed page renders it; tour-position.util.ts is the pure,
                 unit-tested popover-placement math; TourOverlayComponent is
                 mounted once at the app root and renders only while a tour
                 is active
```

Each `features/*` folder is a routed, lazily-loaded page (`loadComponent` in `app.routes.ts`). Pages that call the API always guard their subscriptions with `takeUntilDestroyed()` so a slow response arriving after navigation away never touches a destroyed component's state.

## Mobile app shell (`frontend/ios/`, `frontend/android/`, Phase 22)

Capacitor wraps the exact same Angular build used for web — `frontend/ios/`/`frontend/android/` are native project shells around it, not a second app. `frontend/capacitor.config.ts` is the one place this diverges from the web deployment:

- **`server.hostname`/`androidScheme`/`iosScheme` point at the real API domain**, not Capacitor's default `capacitor://localhost` — this makes the WebView's own origin equal the API's origin, so Phase 13's httpOnly/`sameSite: 'lax'` auth cookies (`backend/src/auth/cookie.util.ts`) keep working completely unchanged inside the native shell. No cookie flag was relaxed to make this work; see [roadmap.md](roadmap.md) Phase 22's implementation notes for the reasoning against the alternatives (`sameSite: 'none'`, Capacitor's native HTTP bridge).
- **`CAPACITOR_LOCAL_HOST`** (an env var, read at `cap sync` time) swaps in a developer's LAN IP + plain `http` for simulator/emulator testing against a local backend instead of the real domain — wired into `make ios LOCAL_HOST=<ip>`/`make android LOCAL_HOST=<ip>` (root `Makefile`). Needs the matching dev-only ATS exception (`ios/App/App/Info.plist`) or cleartext network-security-config (`android/app/src/main/res/xml/network_security_config.xml`) uncommented — both inert by default, both flagged to remove before any store submission.
- **A `<meta http-equiv="Content-Security-Policy">` tag in `frontend/src/index.html`** mirrors `infra/Caddyfile`'s header CSP (Phase 21) — the WebView serves this HTML from the local bundle, which never passes through Caddy, so the header alone would leave the native app with no CSP at all. Header-only directives (`frame-ancestors`, `Permissions-Policy`) can't be expressed this way and stay server-side-only.
- **Platform-specific UI branching** goes through `PlatformService` (`core/services/platform.service.ts`, wraps `Capacitor.getPlatform()`/`isNativePlatform()`), used today to: hide any Stripe checkout-initiating CTA on iOS (Apple 3.1.1's "external subscription, business tool" pattern — `PaywallModalComponent`/`subscribe.page.ts`) and hide Google login on iOS specifically (Apple 4.8 — see roadmap notes).
- **Push notifications**: `PushRegistrationService` (a no-op on web, `Capacitor.isNativePlatform()` guarded) registers this device's FCM token with the backend once authenticated (`app.ts`'s constructor effect, same "runs once per login" pattern as the billing-status effect) and unregisters it on logout. Both iOS and Android register an FCM token — see [architecture.md](#backend-backend) → `push-notification/` and [roadmap.md](roadmap.md) Phase 22 for why iOS doesn't need a separate direct-APNs credential.
- **Icons/splash**: generated via `@capacitor/assets` from `frontend/assets/icon.png`/`splash.png` (source art — regenerate with `npx capacitor-assets generate` if that art changes) into each platform's native asset catalog; store *listing* assets (screenshots, descriptions) are a separate, later step, not part of this pipeline.

See the root `Makefile`'s `mobile-build`/`ios`/`android` targets for the day-to-day build/open commands, and [roadmap.md](roadmap.md) Phase 22 for the full set of decisions (domain, bundle id, board redesign, store-compliance audit) behind this shell.

## Docker (`infra/`)

Two independent, non-overlapping Compose projects (`name: facturele-dev` / `facturele-prod` in each file) so dev and prod never share containers, networks, or the Postgres volume even if run from the same machine:

- `infra/docker-compose.yml` (dev, default): `postgres` + `backend` (target `dev`, bind-mounted source) + `frontend` (target `dev`, `ng serve`, bind-mounted source). `backend`, `frontend`, and `postgres` all publish their ports directly to the host (`BACKEND_PORT`/`FRONTEND_PORT`/`POSTGRES_PORT`).
- `infra/docker-compose.prod.yml`: `postgres` (not published) + `backend` (target `prod`, compiled `dist/`, not published) + `frontend` (target `prod`, static build served by Nginx, proxies `/api`, not published) + `caddy` (the only service publishing `80`/`443` — see above). This is the file the OVH server actually runs; see [deployment.md](deployment.md).

`backend/Dockerfile` and `frontend/Dockerfile` are both multi-stage (`base → dev` / `base → build → prod`) so the same file serves both compose targets. See the root `Makefile` for the day-to-day commands.

### Entrypoint scripts (`backend/`)

Both the `dev` and `prod` Dockerfile targets run a small entrypoint script instead of the app command directly, so container startup can do more than just "run the app":

- `backend/wait-for-db.sh`: blocks (up to 60s) until the host:port parsed out of `DATABASE_URL` accepts a TCP connection, shared by both entrypoints below. `depends_on: condition: service_healthy` in the Compose files only gates the *first* `docker compose up` — it isn't re-evaluated when a single container restarts on its own (a crash, or `restart: unless-stopped` after the VPS reboots), so this is what stops the backend from failing on a bare connection-refused in that case.
- `backend/entrypoint.dev.sh`: waits for the DB, applies any already-committed migrations with `prisma migrate deploy` (safe to automate — unlike `migrate dev`, it never prompts or generates a migration), then starts `nest start --watch`. Creating a *new* migration from a schema change stays the deliberate, manual `make migrate` step (`prisma migrate dev`).
- `backend/entrypoint.sh`: same wait-and-migrate, then `exec node dist/src/main.js`. This replaces what used to be an inline `CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]`.

### Deployment/ops scripts (`infra/`)

- `infra/deploy.sh` (`make deploy`): run on the server to ship a new version — `git pull`, rebuild images, recreate containers. No separate migration step: `backend/entrypoint.sh` applies pending migrations itself before the new backend container starts serving traffic.
- `infra/backup.sh` (`make backup`): `pg_dump`s the prod database to a timestamped, gzipped file under `infra/backups/` (gitignored) and prunes anything older than 14 days. Meant to be run from cron on the server. See [deployment.md](deployment.md#backups).
