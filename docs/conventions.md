# Conventions

This document is the concrete, "here's what it looks like in this codebase" companion to [development-rules.md](development-rules.md). Read that first for the *why*; this is the *how*, with real examples from the code.

## One file, one responsibility

Every backend domain (`company/`, `invoice/`) follows the same shape — a new domain should too:

```
<domain>/
  <domain>.controller.ts   # HTTP only: deserialize, call service, return
  <domain>.service.ts      # orchestration only: no Prisma, no calculation
  <domain>.repository.ts   # Prisma only: no business logic
  <domain>.module.ts
  dto/                     # class-validator input contracts
  entities/                # API response shapes
```

When a service starts doing more than one job, split it — this already happened once: `InvoiceService` used to build API/PDF response shapes inline; that logic is now `InvoiceMapper` (`src/invoice/invoice.mapper.ts`), so `InvoiceService` only orchestrates repository + company + mapper calls. If you're adding a new computed view of an invoice, extend `InvoiceMapper`, not `InvoiceService`.

**Naming a domain "Service" collides with NestJS's own layering term.** Phase 5's catalog domain is called `service-catalog/` (`ServiceCatalogController`/`ServiceCatalogService`/`ServiceCatalogRepository`), not `service/` — a `ServiceService` class name is a stutter that reads as a typo. The Prisma model itself is still just `Service` (that's a data-level name, not a NestJS layer, so no collision there).

Calculation logic is *never* inlined into a service or controller — it lives in `InvoiceCalculationService` (`src/invoice/calculation/`), which has zero NestJS/Prisma dependencies on purpose, so it can be instantiated and tested with `new InvoiceCalculationService()` and no test module setup at all.

## Money and quantities

- **Money is always an integer number of cents.** `unitPriceCents`, `subtotalExclVatCents`, etc. Never a float, never euros-as-a-decimal-number. The single point where a euro amount typed by a human becomes cents is the frontend form boundary (`Math.round(value * 100)`), and it happens exactly once — never re-rounded downstream.
- **Quantities that feed into money math use `Decimal`** (`Prisma.Decimal`), not `Float`/JS `number`, until the final rounding step. See `InvoiceCalculationService.computeLineTotal`.
- Rounding happens **once**, to the nearest cent, at the end of a calculation (`toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)`). VAT is computed once on the summed subtotal, not per line then summed.

## Derived data is never persisted

If a value can be computed from other stored data, it is computed on every read, not cached in a column. Invoice totals are the running example: there is no `totalCents` column anywhere — `InvoiceMapper` calls `InvoiceCalculationService` fresh every time an invoice is serialized for a response.

**The one deliberate exception**: `Invoice.vatApplicable` / `Invoice.vatRateBasisPoints` are snapshotted from `Company` at creation time. This is a conscious trade documented at the point of the decision (see the comment in `schema.prisma` and [database.md](database.md#invoice)) — an issued invoice's tax treatment must not silently change if the artisan's legal status changes later. If you're tempted to add another "snapshot" field, ask whether it's protecting against the same kind of retroactive-correctness problem, or whether it's just caching for convenience (in which case: don't).

**Phase 5 applies this same rule to service-line redistribution.** `InvoiceServiceLineWeight` persists only the artisan-set *weight* per line — never the redistributed cents themselves. `InvoiceMapper.toInvoiceWithTotals()` calls `InvoiceCalculationService.computeWeightedSplit()` fresh on every read to turn those weights into cents and folds each share into that line's `lineTotalExclVatCents`, the same way it recomputes the invoice subtotal every time rather than storing one.

## Saved records are autofill, not a lock (Customer attach)

`Invoice.customerId` (Phase 2) is a soft reference, not a live join: picking
a saved `Customer` on the invoice-create screen (`invoice-create.page.ts`,
`onCustomerSelected()`) is a one-shot autofill of the customer text
fields — those fields stay fully editable afterward, and whatever they hold
at submit time is what gets persisted on the invoice, even if it diverges
from the saved customer. `InvoiceService.create()` only confirms
`customerId` exists (a clean 404 instead of a raw FK error); it never
overwrites `customerName`/`Address`/`Email`/`Phone` from the customer
record. The same "typed value always wins" rule extends to a `PATCH`: an
omitted optional field is treated as an explicit clear-to-`null` (see
`CustomerRepository.update`/`ProductRepository.update`), not "leave
whatever was there" — full replace means full replace. If you add another
"pick a saved X to prefill Y" flow (e.g. products on invoice lines later),
follow the same shape: autofill once, never re-lock, never silently
override what the artisan typed after the fact.

## Validation

Every external input is validated with `class-validator` DTOs, enforced globally by `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` in `main.ts`. Concretely:

- Every field has a type decorator (`@IsString`, `@IsInt`, `@IsEnum`, ...).
- String fields have a `@MaxLength` — no unbounded text is accepted.
- Numeric fields that feed a calculation have both a `@Min` and a `@Max` (see `CreateInvoiceLineDto`) — bounds exist to reject obviously-wrong input before it reaches the calculation service, not to model a real business limit.
- Cross-field business rules (e.g. "a `UNIT` line can't have a waste surcharge") are custom validators (`WasteSurchargeOnlyForArea`), not schema constraints — they're about input shape, not data integrity, so they live in `dto/`.
- Format constraints that are genuinely domain rules (a French SIRET is exactly 14 digits) are `@Matches` regexes, not free-text strings.

## Testing priorities

Per development-rules.md: calculations and financial logic come first. In practice:

- `InvoiceCalculationService` and `InvoiceMapper` have the most thorough unit test coverage in the repo, because they're where money is computed. Every new pricing rule needs a test named after the business behavior it implements (e.g. `'applies a 10% waste surcharge to the billed quantity for area mode lines'`), not after the method being called.
- `PdfService` gets a single smoke test (non-empty buffer, starts with `%PDF`) — the money math it renders is already covered upstream; duplicating those assertions in a PDF-rendering test would test the same thing twice for no benefit.
- E2E tests (`backend/test/*.e2e-spec.ts`) exercise the real pipeline end-to-end against a real Postgres — they're a sanity check that the layers wire together correctly, not a place to re-verify calculation edge cases already covered by unit tests.

## Backend security defaults

Any new HTTP-facing code should assume these are already in place (`main.ts` / `app.module.ts`) and not re-implement them:

- `helmet()` for standard security headers.
- `@nestjs/throttler` global guard (100 req/min/IP by default) — override per-route with `@Throttle()` only for a deliberate reason.
- Environment variables are validated at boot (`src/config/env.validation.ts`) — add new required config there, not as an ad hoc `process.env.X` read; inject `ConfigService` instead of reading `process.env` directly anywhere in application code.
- `PdfService` locks down pdfmake's URL/local-file access policies — any future addition to PDF rendering that pulls in external or local resources must extend that allowlist deliberately, not disable the policy.
- **Any code that fetches a URL supplied by the user is an SSRF (Server-Side Request Forgery) risk and must go through `SafeFetcherService`** (`src/product/import/safe-fetcher.service.ts`), not a bare `fetch()`/`undiciFetch()` call. It validates the destination IP at the exact moment the TCP socket connects (via a custom DNS `lookup` wired into undici's `Agent`), not with a separate up-front check — a naive "resolve, check, then fetch(url)" is vulnerable to DNS rebinding, where a malicious DNS server returns a safe IP for the check and a private one moments later for the real connection. `ip-guard.ts`'s `isBlockedIp()` is the single source of truth for which addresses are off-limits (loopback/private/link-local/cloud-metadata); if you need another outbound-fetch feature, add a test case there rather than re-deriving the IP ranges elsewhere.

## Concurrency, resource lifecycle & scale limits

- **Report "not found" from the write itself, not a separate pre-check.** `CustomerService.update()`/`ProductService.update()` call `repository.update()` directly and catch Prisma's own `PrismaClientKnownRequestError` with `code === 'P2025'`, translating it to a `NotFoundException`. They deliberately do **not** `findById()` first — a check-then-act pair leaves a window where a concurrent request removes the row between the two calls, turning what should be a clean 404 into an unhandled 500. This is also strictly fewer DB round trips. The one exception is `InvoiceService.create()`'s `customerId` pre-check, which is safe *only* because there is no `DELETE /customers` endpoint yet — the comment at that call site says so explicitly; if a delete endpoint is ever added, that check needs the same treatment.
- **Every `findAll()` is capped, never truly unbounded.** `InvoiceRepository`, `CustomerRepository`, and `ProductRepository` all `take` a fixed maximum (see the `MAX_LISTED_*` constant next to each) instead of fetching the whole table — this bounds query cost and response payload size as data accumulates. It's a stopgap, not real pagination; the comment next to each constant says when to revisit it (once "the first N" stops being "everything" in practice).
- **Anything that holds a pooled connection/resource across requests must implement `OnModuleDestroy` and actually get a chance to run it.** `PrismaService` disconnects Prisma; `SafeFetcherService` closes its `undici.Agent` (open keep-alive sockets to supplier sites would otherwise leak across `nest start --watch` reloads or a container redeploy). Neither fires on a real `SIGTERM` unless `app.enableShutdownHooks()` is called in `main.ts` — Nest does not listen for OS shutdown signals by default, only for an explicit `app.close()` (which is why this was easy to miss: tests call `app.close()` directly and always looked fine).

## Frontend conventions

- **Standalone components only**, no `NgModule`. `ChangeDetectionStrategy.OnPush` on every component.
- **Signals** for local component state (`signal`, `computed`). No NgRx/store — introduce one only if state sharing genuinely outgrows this, not preemptively.
- **Every HTTP subscription in a component is piped through `takeUntilDestroyed(this.destroyRef)`.** This is the modern Angular equivalent of implementing `ngOnDestroy` to unsubscribe — it prevents a late-arriving response from writing into a signal after the component (and the DOM it drives) is gone. Inject `DestroyRef` once as a field; the operator needs it explicitly when called from a method (e.g. `submit()`) rather than the constructor, since only the constructor runs inside Angular's implicit injection context.
- **Double-submit guard**: every submit handler checks its own in-flight signal first (`if (this.creating()) return;`) before doing anything else — the disabled-button binding covers the common case, but the guard is what actually prevents a race if a click slips through before change detection re-renders the button.
- **Tailwind utility classes directly in templates** — no custom CSS files beyond `styles.css`'s single `@import 'tailwindcss'`. Shared visual patterns (e.g. the big-button look) become a small component (`shared/components/`), not a shared CSS class.

## No business-logic duplication

The backend is the single source of truth for calculations. The one narrow, deliberate exception is the invoice-create screen's **live total preview** (`features/invoice-create/calculation-preview.ts`) — it mirrors the backend's pricing formulas in pure client-side functions so the artisan sees a running total while typing, before anything is submitted. It is explicitly commented as "preview only" at its definition, and the screen always renders the real backend response as the actual invoice once created — never the client-side estimate. Don't extend this pattern to other calculations without the same justification (a real-time UX requirement that a round-trip to the server can't satisfy).

Phase 5's service lines stayed inside that same exception without growing it: since the preview only ever shows the aggregate subtotal/VAT/total (never a per-line total), and both service-line modes add their full amount to that aggregate by definition, the preview only needs `subtotal += serviceAmountCents` — it does **not** duplicate `computeWeightedSplit`'s weighted-redistribution math on the client. If a future screen needs to preview *per-line* totals under a pending redistribution, that would be new client-side business logic and needs the same justification as the rest of this section, not a silent copy-paste of the backend algorithm.

## Comments

Default to no comments — names should carry the "what". Write one only when the *why* is genuinely non-obvious: a hidden constraint, a race condition being prevented, a rejected simpler alternative, a legal/business rule that isn't derivable from the code itself. Every non-trivial comment already in this codebase follows that pattern (e.g. the `upsert`-not-`findUnique` comment in `CompanyRepository`, the VAT-snapshot comment on `Invoice`) — match that bar, don't pad files with restated-in-English versions of what the next line already says.
