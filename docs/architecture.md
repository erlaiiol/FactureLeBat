# Architecture

## System overview

```
┌─────────────────┐        /api/*  (JSON)        ┌──────────────────┐        ┌────────────┐
│  Angular SPA     │ ───────────────────────────▶ │  NestJS API       │ ─────▶ │ PostgreSQL │
│  (frontend/)      │ ◀─────────────────────────── │  (backend/)        │ ◀───── │            │
└─────────────────┘                              └──────────────────┘        └────────────┘
```

- **Dev**: the Angular dev server (`ng serve`, port 4200) calls the Nest API directly on `localhost:3000` — CORS is enabled backend-side for that origin.
- **Prod**: Nginx serves the compiled Angular bundle and reverse-proxies `/api/*` to the backend container on the same origin — no CORS needed. See `infra/nginx.conf`.

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
  invoice/         the core domain
    calculation/   pure, dependency-free pricing math (InvoiceCalculationService), including
                   Phase 5's weighted redistribution split (computeWeightedSplit)
    dto/           class-validator input contracts, including Phase 5's service-line
                   cross-field validators (service-line-visibility-consistency.validator.ts,
                   service-line-weights-match-lines.validator.ts)
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

`Company.tourEnabled`/`Company.completedTours` (a `String[]` of tour ids) back the frontend's onboarding tour — see the Phase 8 roadmap notes for why they live on the singleton `Company` row rather than a new per-user table. `OnboardingRepository` reuses `company/company.constants.ts`'s `DEFAULT_COMPANY_PROFILE` for the same "PATCH can legitimately be the first write" upsert reasoning as `CompanyRepository`, since onboarding state can be touched before any `Company` profile GET/PATCH ever happens.

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

## Frontend (`frontend/`)

Angular (standalone components, no NgModules), signals for local state, `OnPush` everywhere, Tailwind CSS for styling.

```
src/app/
  core/
    models/      TypeScript types mirroring backend DTOs/response shapes
    services/    thin HttpClient wrappers (one per backend domain)
  features/
    invoice-create/   the invoice creation flow (Phase 6): a shell
                      (invoice-create-shell.page) hosting two routed steps —
                      customer-step/ and lines-step/ — plus invoice-draft.store.ts,
                      a shared providedIn:'root' store (customer + lines +
                      service lines + live total preview) both steps and the
                      shell read/write, persisted to localStorage so a
                      refresh mid-flow doesn't lose the draft
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
                 declares the three mini-tours' steps; TourService
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

## Docker (`infra/`)

Two independent, non-overlapping Compose projects (`name: facturelebat-dev` / `facturelebat-prod` in each file) so dev and prod never share containers, networks, or the Postgres volume even if run from the same machine:

- `infra/docker-compose.yml` (dev, default): `postgres` + `backend` (target `dev`, `nest start --watch`, bind-mounted source) + `frontend` (target `dev`, `ng serve`, bind-mounted source).
- `infra/docker-compose.prod.yml`: `postgres` + `backend` (target `prod`, compiled `dist/`, runs `prisma migrate deploy` on container start) + `frontend` (target `prod`, static build served by Nginx, proxies `/api`).

`backend/Dockerfile` and `frontend/Dockerfile` are both multi-stage (`base → dev` / `base → build → prod`) so the same file serves both compose targets. See the root `Makefile` for the day-to-day commands.
