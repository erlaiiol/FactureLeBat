# FactureLeBat Roadmap

## Product Vision

FactureLeBat is a SaaS application designed for construction artisans and independent contractors.

The initial goal is to help flooring installers create professional invoices quickly.

The long-term goal is to provide a complete business management platform for artisans:

- product catalog management
- supplier data extraction
- quote and invoice generation
- customer management
- project tracking
- business insights

The product must remain simple enough for craftsmen who are not technical. The UI must be clear. The UX must be the fastest with big buttons. We must write a minimum. We must click a maximum.

Priority order:

1. Reliability
2. Simplicity
3. Maintainability
4. Scalability
5. Performance


---

# Current Phase: Foundation

## Objective

Build a clean and maintainable technical foundation.

The application architecture must support future SaaS growth without premature complexity.

## Completed

- [x] Project created
- [x] NestJS backend initialized
- [x] Prisma configured
- [x] PostgreSQL planned
- [x] Monorepo structure created
- [x] Git initialized
- [x] Husky configured
- [x] lint-staged configured
- [x] Prettier configured
- [x] ESLint configured
- [x] Development rules documented
- [x] Docker (dev + prod) configured
- [x] Angular frontend initialized


---

# Phase 1 — Invoice Core (MVP)

## Objective

Create the first functional workflow:

A craftsman can create an invoice and generate a PDF.

Workflow:
User
|
Create invoice
|
Backend validation
|
Database storage
|
Invoice calculation
|
PDF generation
|
Download invoice

## Backend Structure

Create (if not already in backend/):
src/
database/
invoice/
pdf/
common/


## Database Models

### Invoice

Required fields:

- id
- invoice number
- creation date
- customer information
- invoice lines
- totals


### InvoiceLine

Required fields:

- product description
- quantity
- unit
- unit price
- calculated total


Financial rules:

- Never use floating point numbers for money.
- Store monetary values as integers representing cents. Example: 39.90 can be stored as 3990.

## Features

- [x] Create invoice
- [x] Store invoice in database
- [x] Retrieve invoice
- [x] Calculate totals
- [x] Generate PDF
- [x] Download PDF


---

# Phase 2 — Customer Management

## Objective

Avoid rewriting customer information for every invoice.


## Customer Entity

Create:
Customer
name
company name
address
email
phone
legal information

eatures:

- [x] Create customers
- [x] Edit customers
- [x] Search customers
- [x] Attach customers to invoices


---

# Phase 3 — Product Catalog

## Objective

Allow artisans to create their own material database.


Example:
Product
Parquet chêne massif
Price:
45€/m²
Supplier:
Supplier website

Unit:
m²


Features:

- [x] Create products
- [x] Store prices
- [x] Store suppliers
- [x] Store units
- [x] Search products


Supported examples:

- parquet
- glue
- underlay
- finishing products
- tools


---

# Phase 4 — Smart Product Import

## Objective

Reduce manual entry.

A craftsman can paste a supplier URL.

Example:
https://supplier.com/product/parquet-oak

FactureLeBat extracts:

- product name
- price
- unit
- description
- supplier


Possible technologies:

- HTML parsing
- structured data extraction
- supplier APIs
- AI extraction when necessary


Security requirements:

- [x] Validate URLs
- [x] Never trust external content
- [x] Sanitize extracted data

Features:

- [x] Paste a supplier URL and extract product name/price/unit/description/supplier
- [x] Extraction never auto-saves — always a reviewable, fully-editable draft (same "autofill, not a lock" rule as Phase 2's customer picker)
- [x] SSRF-safe fetch: blocks loopback/private/link-local addresses (including cloud metadata), validated at the DNS-resolution step used for the actual connection (closes the DNS-rebinding gap), bounded redirects/timeout/response size, content-type restricted to HTML
- [ ] AI extraction fallback — deliberately deferred, not needed yet: JSON-LD/Open Graph structured-data extraction covers the common case with zero external dependencies; revisit only if real supplier pages turn out not to have either


---

# Phase 5 — Service Lines & Flexible Pricing

## Objective

Let an artisan add "services" to an invoice, in addition to products (e.g. labor, expertise, misc charges — anything that isn't a physical material).

A service can be added in two ways:

- **Visible**: its own extra line on the invoice, just like a product line.
- **Invisible**: no line of its own — its price is redistributed into the other invoice lines instead, equally or with custom weights the artisan controls.

This lets the artisan shape the invoice's presentation freely (e.g. add "100€ of arbitrary know-how" without it appearing as its own line), while the displayed total always increases by the full amount added, regardless of which mode is used.

## Data Model

### Service

Same shape as Product, minus supplier fields:

- id
- name
- description
- unit price
- default visibility mode

### Service line on an invoice

- reference to a Service (or ad-hoc name + price, same "autofill, not a lock" rule as products)
- visibility: `VISIBLE` (own InvoiceLine) or `REDISTRIBUTED` (hidden)
- when `REDISTRIBUTED`: a distribution across the invoice's other lines — either equal split, or a per-line weight/amount the artisan sets manually

## Features

- [x] Create and manage services (name, price), mirroring the product catalog
- [x] Add a service to an invoice as its own visible line
- [x] Add a service to an invoice as a hidden amount, redistributed into the other lines
- [x] Choose redistribution strategy: equal split across lines, or manual per-line weighting
- [x] Redistribution math stays integer-cents only, with rounding remainders assigned deterministically (no floating point, no cents lost or invented)
- [x] Displayed invoice total always increases by the exact service amount added, in both visible and redistributed modes

## Implementation notes

- **Weighted redistribution, not two code paths.** An EQUAL split is expanded into an explicit weight of `1` per invoice line at creation time (`InvoiceService.create`); from persistence through to display, the system only ever deals with one concept — a weighted split (`InvoiceCalculationService.computeWeightedSplit`, the "largest remainder"/Hamilton apportionment method). This is what guarantees the redistributed cents always sum to exactly the service amount, with the leftover cent(s) assigned deterministically (largest fractional remainder first, ties broken by ascending line index).
- **Visible service lines render separately, not merged into the product lines.** A `Service` has no quantity/unit/waste-surcharge dimension, unlike `InvoiceLine` — forcing it into that shape would have meant fake `quantity: 1` rows. Instead, `InvoiceServiceLine` is its own entity, and the API/PDF expose it as its own `serviceLines` list. VISIBLE ones get their own PDF table section ("Prestations"); REDISTRIBUTED ones never appear there — their amount is already folded into the product lines' displayed totals.
- **Nothing about a redistribution is persisted except the weights.** Same "derived data is never persisted" rule as invoice totals (see conventions.md): `InvoiceServiceLineWeight` stores only the artisan-set weight per line; the actual redistributed cents are recomputed by `InvoiceMapper` on every read.


---

# Phase 6 — Invoice Creation UX Overhaul

## Objective

Separate the invoice creation flow into clearer steps, and keep the essentials always on screen.

## Flow

1. Choose or create a customer.
2. Choose or create product(s) and/or service(s).

Always visible and accessible, at every step of this flow:

- The invoice's current total price.
- A "Preview invoice" button, so the artisan can see the invoice (PDF or equivalent) at any point before saving.

## Features

- [x] Step 1: dedicated customer picker/creation screen
- [x] Step 2: dedicated product/service picker/creation screen
- [x] Persistent, always-visible running total across every step of invoice creation
- [x] Persistent "Preview invoice" button, reachable from any step, reflecting the draft's live state
- [x] Preview never requires saving the invoice first

## Implementation notes

- **Preview renders through the exact same pricing/PDF pipeline as a real invoice, minus persistence.** `POST /invoices/preview` takes the same `CreateInvoiceDto` as `POST /invoices`, but `InvoiceService.previewPdf()` only reads the company profile (no Prisma writes) and hands off to a new `InvoiceMapper.toPreviewPdfData()`, which runs `InvoiceCalculationService` positionally over the DTO's `lines`/`serviceLines` (no persisted ids exist yet for a draft) instead of over persisted rows. The EQUAL→weight-of-1 redistribution expansion was pulled out of `InvoiceService.create()` into a shared pure function (`redistribution.util.ts`, `expandServiceLineWeights`) specifically so the preview and persisted paths can never compute a different split for the same input. The rendered PDF's invoice number is the literal string `'BROUILLON'` — never a real allocated number, since nothing was persisted.
- **The frontend's "nouvelle facture" flow is a shell + two routed steps, not one page.** `InvoiceCreateShellPage` hosts a `<router-outlet>` for `client` and `lignes` (children of `factures/nouvelle`) plus a sticky bottom bar with the live total and the "Aperçu" button — both steps, and the shell, read/write the same `InvoiceDraftStore` (`providedIn: 'root'`) rather than each step owning isolated form state. This is also why company profile / saved customers / saved services are loaded once in the store's constructor instead of being re-fetched by each step.
- **The draft survives a refresh via `localStorage`**, written by an `effect()` on the store's signals and hydrated back on construction — wrapped in try/catch throughout, since a parse failure or unavailable storage (private browsing) should degrade to a blank draft, never block the page.
- **A bare `<form (ngSubmit)>` with no `[formGroup]`/`NgForm` directive silently falls back to a native full-page form submit.** The lines/services step has two independent `FormArray`s (no umbrella `FormGroup`), so its submit button lives in a plain `<div>` with `(click)="submit()"` on a `type="button"` — not inside a `<form>` — since `(ngSubmit)` only does anything (including `preventDefault()`) when a `FormGroupDirective`/`NgForm` is actually attached to the element. Angular's template compiler does not error on this; it silently treats the unrecognized output as a native DOM listener that a browser's `submit` event never fires, so the bug only surfaces at runtime as an unexplained full-page reload. Caught during this phase's manual smoke test, not by the build or unit tests.


---

# Phase 7 — Guided Data Entry

## Objective

Minimize free typing. The artisan should click, not write, wherever the domain allows it.

## Features

- [x] Replace the free-text unit field with a dropdown of a fixed, curated list of units (m², ml, unité, forfait, heure, jour, kg, litre, m³ — covers what's actually found on a flooring/general artisan job site)
- [x] Line calculations (area/unit mode, waste surcharge) driven off the selected unit's semantics rather than free text
- [x] Short, plain-language tooltip under each form field explaining what the field is for and why it matters — applied to every data-entry form in the app (invoice lines/services/customer step, product, service, customer, company settings), not just invoice creation

## Implementation notes

- **The AREA/UNIT calculation mode is no longer a field at all — it's derived from the chosen `Unit`, and never persisted.** This follows the same "derived data is never persisted" rule as invoice totals and Phase 5's redistribution splits (see conventions.md). `InvoiceLine.mode`/the `LineMode` enum are gone from the schema entirely; `backend/src/common/unit.util.ts`'s `isAreaUnit(unit)` (true only for `SQUARE_METER`) is the single source of truth the calculation service, the `WasteSurchargeOnlyForArea` validator, and the invoice mapper all derive it from. `CreateInvoiceLineDto` no longer accepts a `mode` field — picking a unit *is* picking the mode, so there's no longer a way for the two to disagree.
- **The same `Unit` vocabulary is shared by `Product.unit` and `InvoiceLine.unit`**, living in `common/` rather than either domain, the same cross-domain-utility precedent as `company/legal-status.util.ts` being imported by `invoice/`. Phase 4's `ProductExtractionService.detectUnit()` now returns a `Unit | null` directly instead of a raw scraped token, so an imported product draft's unit prefill is type-safe with the dropdown from the moment it lands.
- **Migration backfill, not a destructive column swap.** `prisma migrate dev` refuses to run non-interactively and can't auto-cast free text to an enum with existing rows present, so the migration (`20260722120000_unit_enum_and_derived_mode`) was hand-written: add a nullable `Unit` column, backfill it from the old text column via a best-effort `CASE` mapping (`"m2"/"m²"` → `SQUARE_METER`, `"unite"/"unité"` → `UNIT`, etc.), default anything unrecognized to `UNIT` rather than guessing `SQUARE_METER` and silently turning on waste-surcharge billing, then drop the old column and drop `mode`/`LineMode` entirely.
- **PDF rendering shows the French label, the JSON API returns the raw enum.** `InvoiceMapper` converts `Unit` → `UNIT_LABELS[unit]` (e.g. `SQUARE_METER` → `"m²"`) only when building `InvoicePdfData` — `PdfService` still knows nothing about the enum, matching "PDF generation must be isolated from business logic". `GET/POST /invoices` responses keep the raw `Unit` value (`"SQUARE_METER"`), same convention as every other enum field (`wasteSurcharge`, `visibility`) — the frontend has its own mirrored `UNIT_LABELS` (`core/models/unit.model.ts`) for display, via a `unitLabel` pipe.
- **Tooltips are a persistent caption under the field, not a hover popover.** The artisan works from a tablet/phone on a job site — no reliable hover state, and gloves make small hover targets worse, not better. `shared/components/field-hint.component.ts` (`<app-field-hint text="…">`) is the one place this is styled, used identically across all six data-entry forms.


---

# Phase 8 — Onboarding Tour

## Objective

A playful, step-by-step guided tour that helps new users take the app in hand, that can be turned on or off at will.

## Features

- [x] Step-by-step overlay tour covering the main workflows (invoice creation, product/service catalog, customer management)
- [x] Tour can be enabled or disabled at any time by the user
- [x] Lightweight, gamified feel: progress indicator, friendly copy, small moments of delight rather than a dry walkthrough
- [x] Tour completion/skip state persisted per user or company so it doesn't resurface uninvited once dismissed

## Implementation notes

- **Three independent mini-tours, not one continuous cross-app tour.** Each of the three workflows (`invoice-creation`, `catalog`, `customers`) auto-launches the first time its own section is visited, rather than a single sequence run once at first login — see `frontend/src/app/shared/tour/tour-definitions.ts`.
- **State lives on the `Company` singleton, not a new per-user table.** Same "one implicit user" reasoning as Phase 12's notes: `tourEnabled`/`completedTours` are two new columns on `Company`, exposed through their own `onboarding/` backend module (`GET/PATCH /api/onboarding`, `POST /api/onboarding/tours/:tourId/complete`, `POST /api/onboarding/reset`) rather than folded into `CompanyController`'s full-replace `PATCH /company`, which would have forced every tour-state change to resend the entire company profile.
- **The tour engine is hand-built**, matching this repo's existing preference for small owned UI primitives over a dependency (Phase 7's `field-hint.component.ts` instead of a tooltip library): `TourAnchorDirective`/`TourAnchorRegistryService` let `TourOverlayComponent` spotlight any `appTourAnchor="id"` element by id regardless of which routed page currently renders it, `tour-position.util.ts` is a pure, unit-tested function for clamped popover placement (SVG mask for the spotlight cutout, no animation library), and `TourService` (`providedIn: 'root'`) is the single source of truth for tour state — same "shared, constructed-once" pattern as `InvoiceDraftStore`.
- **A step can name a `route`** (e.g. the invoice-creation tour's client step → lignes step, or the catalog tour's produits → prestations); `TourService` navigates there itself before waiting (bounded, ~2s) for that step's anchor to mount, skipping the step instead of stalling if it never appears.
- **Skip and "finish the last step" are the same terminal action.** Both call the same completion path, appending the tour's id to `completedTours` — the roadmap's "completion/skip state" language treats dismissal and completion as one state, not two.

---

# Phase 8.5 — Site Quantity vs. Product Packaging

## Objective

Remove an ambiguity in the invoicing model: `InvoiceLine.quantity` was being asked to mean two different things at once — "how much does the job site need" (e.g. 23 m² of floor) and "how much do I actually bill for." For a product sold in fixed lots (a box of flooring covering 9 m²), those are not the same number: the artisan needs to buy whole boxes, so the billed quantity is a multiple of the box size, not the raw site measurement. The catalog had no notion of packaging at all, so nothing could drive "chantier quantity → product quantity → total price" automatically.

This is a small, foundational phase inserted before Phase 9 to close that gap in the model, the calculation engine, and the two relevant forms (product catalog, invoice line) — without waiting on Phase 11's catalog picker. Packaging stays freehand-editable on both `Product` and `InvoiceLine`, same "autofill, not a lock" rule already used for customers/services/products elsewhere.

## Vocabulary

- **Site quantity** — `InvoiceLine.quantity` (unchanged field/meaning): the artisan's real on-site measurement/need.
- **Needed quantity** — site quantity after waste surcharge (unchanged math).
- **Billed quantity** — what's actually priced: needed quantity, rounded up to the next whole package when the line has a packaging size and rounding is enabled. Equal to needed quantity whenever no packaging applies — every pre-existing invoice/line is unaffected.

## Data Model

- `Product.packagingQuantity` (optional): how many `unit`s come in one sellable package (e.g. `9` for a 9 m² box). `null` = sold continuously, today's behavior.
- `InvoiceLine.packagingQuantity` (optional, snapshotted/freehand) and `InvoiceLine.roundUpToPackaging` (default **true**): whether the billed quantity rounds up to the next whole package. Defaults to automated (rounding on) with manual exact-quantity billing as the artisan's opt-out — inert when no packaging quantity is set.

## Features

- [x] `packagingQuantity` field on the Product catalog, freely editable, optional
- [x] `packagingQuantity` + `roundUpToPackaging` on an invoice line, freehand (no catalog picker dependency)
- [x] Calculation engine rounds the needed quantity (site quantity + waste surcharge) up to the next whole package when enabled, and prices off that billed quantity
- [x] PDF/preview shows a clarifying note (e.g. "23 m² (facturé : 27 m²)") whenever packaging rounding actually changed the priced quantity — never a silent substitution
- [x] Zero behavior change for any line/product with no packaging quantity set

## Implementation notes

- **Order of operations is waste-surcharge-then-packaging-rounding.** `InvoiceCalculationService.computeLineTotal` first applies the existing waste-surcharge multiplier to get the "needed quantity" (how much material the job truly requires, including cutting waste), then rounds that up to the next whole package. Buying enough boxes to cover the waste too is the physically correct order — reversing it would under-order material.
- **No cross-field validator for `roundUpToPackaging`.** Unlike `wasteSurcharge` (validated against `unit` via `WasteSurchargeOnlyForArea`), `roundUpToPackaging` needs no such guard: it's simply inert whenever `packagingQuantity` is absent, so there's no invalid state to reject.
- **The always-visible running total (Phase 6) is a deliberate, pre-existing exception to "no client-side calculation duplication."** `calculation-preview.ts` already mirrors the backend's math for the shell's live total; this phase extends that mirror with the same packaging-rounding step so the running total never drifts from what the backend will actually bill. The PDF/live Preview screen itself still renders exclusively backend-computed numbers.
- Cross-reference: Phase 11's catalog picker can now prefill `packagingQuantity` from a saved `Product` when it's built; Phase 15's toggleable technical-detail preview is a natural home for showing the needed-vs-billed breakdown, not built here.

---

# Phase 9 — Visual Identity & Motion

## Objective

Give the application a deliberate visual identity instead of default Tailwind styling, and a small, consistent motion system so interactions feel responsive without becoming noisy.

Full decisions (palette, typography, the line-marking badge, motion timing) are documented in [design-system.md](design-system.md) — this phase is about implementing what that document already decided.

## Features

- [x] Translate the "Chantier calibré" palette and type scale into Tailwind v4 `@theme` tokens (`frontend/src/styles.css`)
- [x] Light and Dark-mode variant of "Chantier calibré" for the working application. Togglable with a button.
- [x] Apply "Atelier sobre" only at its three sanctioned locations (invoice PDF header, guided tour, "Mon activité" settings) — never on data-entry screens
- [x] Implement the line-marking badge (shape, color, rotation) as a shared component
- [x] Implement the motion primitives (`lineIn`, `totalPulse`, `badgeStamp`, tour step transitions, tour-completion reward) respecting `prefers-reduced-motion`
- [x] Implement the semantic color tokens (primary/secondary/success/warning/danger/info, solid + subtle variants) as shared button/badge components

## Implementation notes

- **Fonts are self-hosted, never a CDN.** `@fontsource/*` (frontend, woff2, imported once per weight in `styles.css`) and `@expo-google-fonts/*` (backend, real `.ttf` files pdfmake needs on disk) — both OFL-licensed, both bundled into the build/container image, same "never fetch external content" precedent as `SafeFetcherService`/pdfmake's locked-down access policy. No new font is loaded over the network at runtime.
- **Dark mode is a manual toggle, not `prefers-color-scheme`.** `ThemeService` (`core/services/theme.service.ts`, `providedIn: 'root'`) holds a `light`/`dark` signal, toggled from the nav bar, persisted to `localStorage` (same try/catch-degrades-to-default pattern as `InvoiceDraftStore`/`TourService`), and applied via a `.dark` class on `<html>` — `styles.css` redefines Tailwind's `dark:` variant with `@custom-variant dark (&:where(.dark, .dark *))` instead of the v4 default (media-query-only, no manual override possible).
- **The semantic color tokens live once, in `BigButtonComponent`/`BadgeComponent`.** Both take `variant` (primary/secondary/success/warning/danger/info) and `tone` (solid/subtle) inputs resolved through a literal `Record<Variant, Record<Tone, string>>` lookup — a template-literal like `` `bg-${variant}` `` would never be picked up by Tailwind's class scanner, so every combination has to exist as a real string somewhere in source.
- **The line-marking badge is its own component (`LineBadgeComponent`), deliberately separate from `BadgeComponent`.** Same reasoning as the design doc: mixing the stamped/rotated motif into the straight-rectangle semantic badges would dilute both. Wired into `InvoiceServiceLineFormComponent` wherever a service line is set to `REDISTRIBUTED`.
- **Motion primitives are plain CSS `@keyframes` + classes in `styles.css`, not an animation library** — consistent with the rest of the app's small-owned-primitives precedent (Phase 8's hand-built tour engine). `totalPulse` and the tour's step-transition/completion-reward animations replay on every state change (not just once) via the same trick: toggle the class off, then back on inside a `queueMicrotask`/`effect`, since the element itself is never destroyed/recreated between changes.
- **"Atelier sobre" landed in exactly the three sanctioned spots.** The invoice PDF header (`PdfService.buildHeader`, Zilla Slab + Work Sans + walnut, everything else on the document stays Roboto/black-and-grey), the guided tour overlay, and the "Mon activité" section of company settings (wrapped in its own `<section>`, ending before the unrelated "Visites guidées" block, which stays "Chantier calibré").


---

# Phase 9.5 — Invoice Creation Mode Choice: Quick vs. Manual

## Objective

When starting a new invoice, the artisan first picks between two entry modes on a small choice screen:

- **Mode rapide** — today's flow (Phases 6/7/8.5/11): customer picker, catalog-driven lines, guided fields, click over typing.
- **Mode manuel** — a free-form, paper-like invoice canvas for artisans who are uncomfortable with forms, dropdowns, and multi-step flows, and would rather fill in something that looks and behaves like the final document itself.

Both modes end at the same place: a valid invoice, priced and PDF-able through the existing pipeline. Manual mode is an alternate *input surface*, not a second invoicing engine — but it turned out to need its own body shape underneath (see Data Model below), not a literal reuse of `InvoiceLine`/`Service`.

## Manual Mode — Free-Form Invoice Canvas

- The canvas looks like a PDF preview of an invoice: every string (client name, line description, quantity, price, etc.) is directly clickable and editable in place (real `<input>`/`<textarea>` elements styled borderless, not a separate form).
- The classic invoice table can grow: a "+" control below the table adds a row, a "+" control to the right of the table adds a custom column.
- Rows and (non-required) columns can be removed with a matching "−"/"✕" control. Column width and row height are individually resizable by dragging their edge, the way a spreadsheet or word-processor table behaves.
- A single "Mettre en forme" (format) button normalizes number formatting (quantity/unit price) and trims stray whitespace across the whole table in one click.
- The "Total" column is always computed, never typed — it is a synthetic, read-only column appended at render time (client canvas and PDF alike), not part of the stored table.

## Data Model

Discovered during implementation that a MANUAL invoice's body is structurally too different from `InvoiceLine` (free-form columns vs. fixed unit/waste-surcharge/packaging fields) to reuse it directly, while still clearly being *the same kind of document* as a GUIDED invoice (same sequential numbering, same customer/VAT snapshot, same PDF pipeline). Resolved as: `Invoice` stays the single entity, with a new `entryMode: GUIDED | MANUAL` discriminator, and three satellite tables for the MANUAL body:

- `ManualInvoiceColumn` (`role: DESCRIPTION | QUANTITY | UNIT_PRICE | CUSTOM`, `label`, `widthPx`) — exactly one `DESCRIPTION`/`QUANTITY`/`UNIT_PRICE` per invoice, any number of `CUSTOM`.
- `ManualInvoiceRow` (`heightPx`) — one per priced line item, the manual-mode equivalent of an `InvoiceLine`.
- `ManualInvoiceCell` (`rowId`, `columnId`, `value: String`) — always plain text, never markup.

A GUIDED invoice's `lines`/`serviceLines` stay exactly as before; a MANUAL invoice leaves them empty and uses these three tables instead. `InvoiceMapper`/`PdfService` branch on `entryMode`.

## Features

- [x] "Nouvelle facture" now opens a mode-choice screen (mode rapide / mode manuel) before either flow starts
- [x] Mode rapide is exactly today's flow, unchanged (moved one path segment deeper, `factures/nouvelle/rapide/*`)
- [x] Mode manuel: PDF-like canvas where every field is click-to-edit in place, no external form
- [x] Add a row/column via "+" controls positioned below (row) and to the right (column) of the table, remove via a matching "−"
- [x] Resize a row/column by dragging its border, with sane min/max bounds (40–800px columns, 24–400px rows)
- [x] "Mettre en forme" button normalizes spacing/number formatting across the table in one click
- [x] Manual-mode rows are priced by the existing `InvoiceCalculationService` as-is (treated as a plain `UNIT`-mode line: quantity × unit price, no waste surcharge/packaging — those are GUIDED-only concepts) — same totals rules (integer cents, no floating point), same PDF pipeline, same preview-before-persist flow as mode rapide
- [x] Switching mode mid-draft is deliberately disabled — each mode has its own independent draft store/localStorage key; starting over in the other mode means starting a new draft, not converting one
- [x] Tour mode updated: 'invoice-creation' now introduces the mode-choice screen before continuing into mode rapide; a new, separate 'invoice-creation-manual' mini-tour auto-launches the first time mode manuel is opened (add/remove row/column, resize, "Mettre en forme")

## Security & Library Notes

- **Cell editing uses real `<input>`/`<textarea>` elements, not `contenteditable` + DOMPurify.** A native form control's `.value` is always plain text — pasted content can never be interpreted as HTML through it, so there is no injection surface to sanitize against in the first place. This is a stronger guarantee than sanitizing after the fact, at lower implementation cost, so the DOMPurify step originally anticipated here was unnecessary. `PdfService`'s manual-table renderer still treats every cell as plain text data (never markup), same principle as the rest of the PDF pipeline.
- **`interactjs`** (MIT-licensed) is used for drag-to-resize, exactly as anticipated — but only for the low-level drag-delta gesture (`ManualResizeHandleDirective`, a thin reusable directive wrapping `interact(...).draggable(...)`), not to resize DOM elements directly. The emitted pixel delta is clamped and applied to `ManualInvoiceDraftStore`'s own column/row size state, which is what's actually persisted.
- Parsing cell content into priced invoice data stays app code on both ends: `manual-cell-parser.util.ts`/`manual-table-calculation.util.ts` (backend) and `manual-cell-format.util.ts` (frontend, preview-only) — `interactjs` never touches calculation, only presentation geometry.

---

# Phase 10 — Sourcing Assistant (AI Supplier Search)

## Objective

Let the artisan find real-world suppliers and prices for a product on the current invoice/quote, without typing a search query themselves.

Concretely: for a line like "20 m² of bamboo boat-deck flooring," near the customer's city, with a job date a few days out, the assistant proposes several supplier candidates with prices — the same kind of answer an artisan would get by asking an AI chat assistant directly, but wired into the invoice so it needs zero free text.

The assistant should also suggest complementary materials for the job (adhesive, underlayment, finish, trims, etc.) with a "search again" button per suggestion, so a search for one product can fan out into searches for what else the job needs.

## Why this is a bigger step than earlier phases

Unlike Phases 1–8, this phase depends on an external, non-deterministic source (the live web) and an LLM to interpret it. Two things must be designed deliberately, not assumed:

- **Reliability ceiling.** A model reading supplier web pages can find a *listed* price, but delivery windows, regional stock, and "can this actually reach Lyon in 2 days" are rarely published in a machine-readable way. Results must be framed as a starting point to verify with the supplier by phone/site — never as a guaranteed price or ETA. Silently promising accuracy the tool can't deliver is the main risk here.
- **Cost model.** Search for a free 'to start with' model. A "per day use" must be implemented. (Groq ?)

## Architecture

- Backend: a `sourcing` module using the AI Messages API with the server-side `web_search` tool (optionally `web_fetch` to pull a candidate page's full content once found) — no separate search-engine subscription needed, stays inside the existing free AI integration.
- The query is assembled server-side from data already on the invoice: product/service name, quantity, unit, customer address, and target job date — the artisan never types a query, only presses a button.
- Reuse Phase 4's safe-fetch/extraction pipeline (`product-extraction.service.ts`, `safe-fetcher.service.ts`, `ip-guard.ts`) to pull a structured price/unit out of each candidate supplier page, instead of trusting the model's raw read of a search snippet.
- Complementary-material suggestions are a plain (non-search) model call informed by the product's name/category — cheaper and faster than a search, since it's drawing on general knowledge rather than live pricing.
- Frontend : must have a "beta" badge that shows it's clearly not 'fully done yet'.

## Features

- [x] "Trouver des fournisseurs" button on a product/service invoice line — no free text, assembles the query from existing invoice + customer data
- [x] Returns a short list (e.g. 5) of candidate suppliers with name, price, source link, and an explicit "verify before ordering" notice
- [x] Suggests complementary materials/products for the job, each with its own one-click "search suppliers for this too" button
- [x] Per-invoice/per-day search cap to bound cost; cache results so reopening a line doesn't re-trigger a live search
- [x] Results are informational only — never auto-added to the invoice or auto-selected as a product without artisan confirmation

## Implementation notes

- **Provider is Groq, not Anthropic's `web_search` tool** — a deliberate deviation from this phase's original "Architecture" draft above, decided when building this phase: Groq's `groq/compound` model has web search built in and a much cheaper/free-to-start cost profile, which matches this phase's own "search for a free model to start with" cost-model note better than a paid-per-search Anthropic tool would. `GroqClientService` (`backend/src/sourcing/groq/`) talks to Groq's OpenAI-compatible endpoint directly via `undici` (already a dependency, no new SDK) — isolated behind its own `complete()` method so swapping providers later stays a one-file change.
- **One cache table, two kinds.** `SourcingSearch` (`companyId`, `kind: SUPPLIER_SEARCH | COMPLEMENTARY_SUGGESTIONS`, `queryHash`, `resultJson`) does double duty as both the 24h result cache and the daily-cap log: counting rows created today per company *is* counting real Groq calls made today, since a cache hit never inserts a new row. `SOURCING_DAILY_SEARCH_CAP` (default 20/day, shared across both kinds) is the cost guard; a per-route Throttle (10/min) on `SourcingController` is just a burst limiter on top.
- **`GROQ_API_KEY` is optional, not required at boot.** Unlike `DATABASE_URL`, the app starts and runs normally with it unset — `SourcingService` replies `503 Service Unavailable` on that route only, rather than refusing to start (see `env.validation.ts`). This was a deliberate choice given no key was available yet when this phase was built.
- **No `Invoice.jobDate` field was added.** The roadmap draft above assumed a job date already living on the invoice; in practice adding a persisted field for one optional search input would have meant a schema/migration cost for something most invoices will never use. `SearchSuppliersDto.jobDate` is a one-off input scoped to a single search call instead, entered directly in the sourcing panel.
- **Every field of a Groq response is treated as untrusted external input** (`groq-response.util.ts`), same posture as Phase 4's HTML scraping: malformed top-level JSON is a hard failure (`GroqUnavailableError`), but an individual malformed candidate/suggestion inside an otherwise valid array is silently dropped rather than failing the whole search. `sourceUrl` is only ever kept if it parses as a genuine `http`/`https` URL, so the frontend can render it as a link with no further checking.
- **The frontend panel (`SourcingPanelComponent`) fans out exactly one level deep**, not recursively: a complementary suggestion's "Rechercher aussi" runs its own inline supplier search inside the same component instance (`extraSearches`, keyed by suggestion name) rather than mounting a nested copy of the panel — sidesteps Angular standalone self-referencing-component ergonomics for a case the roadmap only ever asked to go one level deep.


---

# Phase 11 — Catalog-Driven Invoicing (Zero-Typing Invoice)

## Objective

Once an artisan's product/service catalog is populated enough, invoice creation should stop requiring typed prices altogether: pick a customer, pick products/services from the catalog, let the app compute everything, then generate the PDF.

This is the natural endpoint of Phase 6 (step-based creation) and Phase 7 (guided data entry): the artisan should be able to build most invoices by clicking and checking boxes, never touching a price field.

## Product/Service Code

Add a `code` field to both `Product` and `Service` — a short artisan-defined reference (SKU-like), the way professional trades already identify catalog items. This is a prerequisite for this phase's picker UX (searching/scanning a large catalog by code is faster than by name) and is also what makes Phase 9's AI sourcing assistant able to reliably match "is this the same product, just repriced/renamed/restocked" across searches, instead of guessing off a fuzzy name match.

- [x] `code` field on `Product` (optional, unique per artisan, freely editable)
- [x] `code` field on `Service` (optional, unique per artisan, freely editable)
- [x] Code shown and searchable everywhere name currently is (catalog list, invoice line picker)

## Catalog Picker UX

- [x] Step 2 of invoice creation (Phase 6) gains a catalog-first mode: browse/search/filter the artisan's own products and services instead of starting from a blank line
- [x] Selection by checkbox list and/or drag-and-drop onto the invoice draft (UX choice to be validated with real usage — whichever proves fastest with one hand on a job site wins, they are not mutually exclusive)
- [x] Selecting a catalog item prefills name, unit, and price — quantity is the only field the artisan still normally types
- [x] Selecting a catalog item also prefills `packagingQuantity`/`roundUpToPackaging` from the Product (Phase 8.5 already added the data — this phase is what makes it flow from a picked catalog item instead of only freehand entry)
- [x] Manual price/name override remains possible line-by-line (same "autofill, not a lock" rule as every prior catalog-backed feature)
- [x] Empty or sparse catalogs gracefully fall back to today's manual-entry flow — this feature must never block invoicing for a new user with zero products saved

## Non-goals

- No change to how totals/redistribution are calculated (Phase 5's engine is reused as-is) — this phase is purely about removing typing from data entry, not about the math.

## Implementation notes

- **`Product.code` and its UI already existed going into this phase** (added under an earlier, differently-scoped commit as prep for Phase 10's sourcing matcher) — this phase's actual delta was giving `Service` the same `code` column/DTO validation/409-on-duplicate mapping, and building the picker itself.
- **Click-to-add, not checkbox-then-confirm.** `CatalogPickerComponent` renders every matching product/service as a row with its own "+ Ajouter" button — clicking one immediately pushes a prefilled line/service-line into the draft. Chosen over a checkbox-multi-select because it's fewer taps for the common one-item-at-a-time case, and clicking several rows in sequence still adds several lines, so nothing is lost versus a multi-select — the roadmap left this an open UX choice, and a "select then confirm" step added friction the click-to-add path doesn't have.
- **Search is a plain client-side filter, not a new backend endpoint.** `InvoiceDraftStore` already loads the full (capped-at-500) product/service catalog once for the whole "nouvelle facture" flow (mirroring how it already loaded `services` pre-Phase-11); the picker filters that in-memory list by name or code. Reuses the existing capped-list trade-off rather than adding a paginated/debounced search round trip for what's already a bounded, pre-fetched list.
- **Quantity is deliberately left at 0, not defaulted to 1, on a catalog-added line.** `InvoiceLineDraft.quantity`'s existing validator (`min(0.001)`) already rejects 0 — reusing that means an artisan can never submit a catalog-picked line without having actually looked at the quantity field, closing off "silently invoiced 1 unit" as a failure mode.
- **`code` is now part of the existing name-search `OR` clause** on both `ProductRepository.findAll` and the new `ServiceCatalogRepository.findAll` filter — satisfies "searchable everywhere name currently is" (catalog list pages, the picker) without a separate search path per field.


---

# Phase 12 — Invoice Mailing

## Objective

Let the artisan send a generated invoice by email directly from the app, using their own address, instead of downloading the PDF and mailing it manually through their own client.

## Features

- [x] Send an invoice PDF by email from the invoice list screen, using the artisan's own email address as the sender
- [x] Default message template that mentions FactureLeBat (product visibility for the artisan's own clients seeing where the invoice came from), editable before sending
- [x] Recipient prefilled from the customer's saved email (Phase 2), editable per send
- [x] Sent status and timestamp recorded on the invoice
- [x] Delivery failures surfaced clearly to the artisan (bounced/invalid address, provider error) rather than silently swallowed

## Notes

- This phase intentionally precedes authentication (Phase 13): it does not yet need to isolate mail sending per user account, since there is only one implicit user today. Revisit sender-address configuration once Phase 13 introduces real per-user accounts.

## Implementation notes

- **"Using the artisan's own address" means real SMTP, not a Reply-To trick.** Decided explicitly with the user before building this phase: a spoofed `From:` header without authenticating as the real mailbox gets rejected/spam-flagged by SPF/DKIM/DMARC on the receiving side, so there is no way to send genuinely "from" the artisan's address without their real credentials. `mail-settings/` stores the artisan's own SMTP host/port/user/app-password (company settings → "Envoi de factures par email"); `MailerService` (`mailer/`) authenticates as that account and sends as them, no third-party relay/branding involved.
- **The SMTP password is encrypted at rest (AES-256-GCM, `smtp-password-crypto.util.ts`), keyed by a new optional `APP_ENCRYPTION_KEY` env var** — optional the same way `GROQ_API_KEY` is (Phase 10): the app boots fine without it, `MailSettingsService`/`InvoiceMailService` just reply 503 until it's set, rather than refusing to start. This is the one secret in the app that must be recoverable (not hashed) to actually authenticate with the artisan's mail provider.
- **Saving SMTP settings verifies the connection first (`transporter.verify()`), before ever persisting it.** An artisan should never end up with a saved-but-broken configuration that silently fails the first time they try to send an invoice — `MailSettingsService.updateSettings` rejects with the provider's own error message (bad host/port/auth) if `verify()` fails, and only encrypts+persists on success. The password is deliberately never round-tripped or kept "unchanged" across edits: every save re-verifies a freshly typed password, trading a small UX cost (re-type it to change any field) for never needing to decrypt-and-merge stored credentials.
- **Three isolated pieces, mirroring the existing Groq/PDF boundary pattern:** `MailerService` (`mailer/`) only knows the raw SMTP transport call (isolated risky boundary, no unit test, same as `GroqClientService`); `MailSettingsService` (`mail-settings/`) only knows credential CRUD + verification; `InvoiceMailService` (`invoice/mail/`) is pure orchestration (resolves recipient/subject/text, renders the PDF via the existing `PdfService`, delegates the send, records the result) — unit-tested with hand-built fakes for its three collaborators, same style as `SourcingService.spec.ts`.
- **`GET /invoices/:id/mail-template` exists so the frontend never duplicates the template copy.** The roadmap's "default template... editable before sending" needs the artisan to see the real default text before choosing to keep or edit it; rather than reimplementing `buildDefaultInvoiceMailTemplate`'s copy client-side (a second source of truth for wording that would drift), the send modal fetches the exact subject/text the backend would use, prefills the form with it, and only ever submits what's actually in the form.
- **`Invoice.sentAt`/`sentToEmail` hold the last successful send only, not a log.** Same "derived/incidental data stays minimal" spirit as the rest of the schema — a later send simply overwrites both, since "has this ever reached the client, and most recently where" is all the UI (a small note under the invoice row) needs.
- **Delivery failures are real SMTP-submission failures only, not delivery/bounce tracking.** `MailerService` surfaces whatever the SMTP server rejects at submission time (auth failure, connection refused, invalid recipient syntax) as a clear error, never silently swallowed. A `250 OK` accept from the SMTP server does not guarantee the message reaches an inbox — actual bounce/delivery-status tracking would need a provider-specific webhook (e.g. SES/Postmark), which is at odds with "any SMTP account the artisan already owns" and was deliberately left out of scope, same honest reliability-ceiling framing as Phase 10's sourcing assistant.


---

# Phase 13 — Secure Authentication & Multi-Tenancy

## Objective

Turn FactureLeBat from a single-artisan tool into a real multi-user SaaS: every artisan gets their own isolated customers/invoices/products/services, behind secure login.

## Features

- [ ] JWT-based authentication (access + refresh tokens)
- [ ] Account creation and login with email/password
- [ ] OAuth2 login/signup via Google
- [ ] All existing data models (Customer, Invoice, Product, Service) scoped to an owning user/account — no cross-tenant data access, enforced at the query layer, not just the UI
- [ ] Migration path for whatever data already exists from the pre-auth single-tenant phases

## Security requirements

- [ ] Passwords hashed with a modern algorithm (e.g. argon2/bcrypt), never stored or logged in plaintext
- [ ] Refresh tokens revocable (logout invalidates them server-side, not just client-side deletion)
- [ ] Standard OAuth2 protections for the Google flow (state parameter, PKCE where applicable, redirect URI allow-list)


---

# Phase 13.5 — Quick Invoice Redesign: Card-Based Client Picker & One-Click Line Activation

## Objective

Push "mode rapide" (Phases 6/9.5/11) to its logical endpoint: for an artisan whose customer/product/service catalog is already populated, creating an invoice should need almost no typing at all. Pick a client from a grid of small cards showing their metadata, land on a single screen where catalog products/services are simply "activated" with a unit quantity typed in, and the price/invoice/PDF appear immediately — email sendable on demand from the same place. If a product/service/client doesn't exist yet, it can still be created inline exactly as today.

This is a UI/UX overhaul of mode rapide's existing steps, not a new invoicing engine, mode, or pricing model — Phase 9.5's `entryMode` split, Phase 5's calculation/redistribution engine, and mode manuel are all untouched.

## Flow

1. **Client cards.** Phase 6's step-1 customer picker becomes a grid of clickable cards, each showing the client's key metadata at a glance (name/company, city, whatever else is useful — e.g. last invoice date). Clicking a card selects the client and advances immediately, no separate confirm step. A "+ Nouveau client" card sits in the same grid, opening today's creation form inline.
2. **Line activation.** Phase 11's catalog picker and the invoice lines list merge into one screen: every catalog product/service is listed with a toggle. Toggling one "on" activates it as an invoice line and reveals an inline quantity/unit input right there on the row — no separate add-line step, no switching between a catalog screen and a lines screen. Toggling off removes the line just as instantly.
3. **Instant price + document.** The running total (Phase 6) updates live as soon as a quantity is typed, and the "Aperçu" PDF stays one click away at all times, same guarantee as Phase 6 — pushed further so nothing about pricing feels delayed or separate from the clicking itself.
4. **Send.** "Envoyer par mail" (Phase 12) is reachable directly from this same screen/preview, without first saving and finding the invoice in a separate list.

## Simplified Inline Product Creation

Creating a new product from the invoice flow (Phase 3/11's "doesn't exist yet" case) currently exposes the full `Product` form. Split it into an essential/minimal view and an optional, expandable full view:

- Default view shows only what's visible/essential on any invoice: name, unit, price.
- A "Afficher tout / Compléter la fiche" dropdown reveals the rest of today's fields (description, fournisseur/URL, code, quantité de conditionnement) for an artisan who wants to fill them in right away.
- Whichever path is used, the result is one ordinary, full `Product` row — nothing partial or second-class. Every field skipped at creation stays freely editable at any time from "Mes produits" (same "autofill, not a lock" rule as everywhere else).

- [ ] Inline product creation defaults to essential fields only: name, unit, price
- [ ] "Afficher tout / Compléter la fiche" toggle reveals the remaining Product fields on demand, same form, no separate screen
- [ ] A product created via the minimal path is identical in the database to one created via the full form — always fully editable afterwards from "Mes produits"

## Service Pricing Mode: Fixed Price vs Percentage Margin

Add a second way to price a `Service`: instead of always typing a fixed €amount, a slider/toggle on the service form lets the artisan switch it to "Pourcentage" — the service's contribution is computed as a percentage of the invoice rather than entered in cents.

Concrete example (from the user): an artisan creates a service once, named e.g. "Marge 30%", and reuses it on every invoice to apply their markup automatically instead of recalculating it by hand each time.

- [ ] "Prix fixe" / "Pourcentage" slider on the Service form
- [ ] In percentage mode, the service stores a percentage value instead of `priceCents`; the amount it adds to a given invoice is computed at build time (percentage × base), not typed per invoice
- [ ] Percentage services stay compatible with Phase 5's VISIBLE/REDISTRIBUTED choice and integer-cents-only rounding — implementation must define what "base" a percentage applies to (visible product/service lines total is the natural default) and a deterministic, non-compounding order when more than one percentage service is used on the same invoice
- [ ] Onboarding tour (Phase 8) update: the artisan is guided to create this exact example — a "Marge 30%" service — as their first practical, reusable service, instead of a generic placeholder example

## Features

- [ ] Client-picker screen redesigned as a grid of compact metadata cards, replacing the current list/search-first UI — search/filter stays available for large customer bases
- [ ] Clicking a client card advances immediately into line activation, no intermediate confirm step
- [ ] Catalog browsing and invoice lines merged into a single screen: each product/service is togglable ("activate"), revealing an inline unit-quantity input the moment it's activated — replaces the separate catalog-picker/line-list split from Phase 11
- [ ] Deactivating a toggled item removes its line instantly, symmetric with activation
- [ ] Products/services/clients that don't exist yet can still be created inline without leaving the flow, same "autofill, not a lock" creation forms as today (Phases 2/3/5)
- [ ] Running total and PDF preview (Phase 6) stay always visible/one click away, now recalculating live per keystroke on an activated line's quantity
- [ ] "Envoyer par mail" (Phase 12) reachable directly from the line-activation screen or its preview, without a detour through the invoice list
- [ ] Empty or sparse client/catalog data gracefully falls back to today's inline-creation flow — must never block invoicing for a new artisan with nothing saved yet (same guarantee as Phase 11)

## Non-goals

- No change to the pricing/redistribution engine (Phase 5), packaging rounding (Phase 8.5), or the `entryMode` GUIDED/MANUAL split (Phase 9.5) — purely a UI/UX consolidation of mode rapide's existing steps into fewer, denser screens.
- Mode manuel (Phase 9.5) is untouched.
- No new persisted fields expected beyond, at most, light display-only client-card metadata (e.g. a computed "last invoice" indicator) — to be confirmed during implementation, and only if it can be derived rather than stored.

## Notes

- Builds directly on Phase 6 (step-based flow, persistent total/preview), Phase 9.5 (mode rapide vs. manuel split — only mode rapide is touched here), Phase 11 (catalog-driven picker), and Phase 12 (mailing) — this phase merges and simplifies what those phases already built rather than replacing them.
- Sequenced right after Phase 13 (auth) rather than waiting for Phase 14 (Stripe) since it doesn't depend on billing and is a UX priority — same kind of mid-sequence insertion as Phase 8.5.

---

# Phase 14 — Stripe Premium Subscription & Admin

## Objective

Introduce a paid tier: a 15€ premium subscription required after an artisan's first invoice, billed and managed through Stripe. Introduce an admin role to oversee users and grant premium access manually when needed.

## Features

- [ ] Stripe integration for subscription billing (checkout, webhooks for payment/renewal/cancellation events)
- [ ] Premium gate: free usage up to and including the first invoice, premium subscription required beyond that
- [ ] Admin account role, separate from regular artisan accounts
- [ ] Admin dashboard to view/search users and their subscription status
- [ ] Admin action to grant temporary premium access (e.g. one month) to a specific user, without requiring payment
- [ ] Promo code system (e.g. a "premium 1 month" code) redeemable by users to unlock premium temporarily

## Notes

- Depends on Phase 13 (accounts must exist before subscriptions can attach to them).


---

# Phase 15 — Mandatory Preview & Customizable Line Detail

## Objective

Preview (Phase 6) stops being optional: the artisan must go through it before the invoice is created for real (persisted + numbered, per Phase 6's implementation notes) — the "Créer la facture" action is only reachable from the preview screen, not directly from the lines step.

On that preview, some pieces of information are highlighted on hover and are click-toggleable: the artisan can show or hide them on the generated PDF, per invoice. Example: an artisan may not want the m² detail (or m³, or any other technical breakdown) to appear to the client, while still needing it computed under the hood for the total to be correct.

## Behavior

- The underlying calculation is never affected by hiding a field — hiding is purely a display/PDF-rendering concern, the totals and stored data stay exactly as computed (same principle as Phase 5's visible/redistributed service lines: what's hidden from the document is not the same as what's absent from the data).
- Toggles are per-field, per-invoice — not a global setting — since what an artisan wants to show varies invoice to invoice depending on the client.

## Features

- [ ] "Créer la facture" (final, persisted PDF) is only accessible from the preview screen; the lines/services step no longer offers a direct path to creation
- [ ] Preview highlights toggleable pieces of information on hover (e.g. per-line technical detail such as m²/m³ breakdown, waste surcharge detail)
- [ ] Click-to-hide / click-to-show on each toggleable piece of information, live-updating the preview
- [ ] Hidden/shown state per field persists for that invoice's draft (surviving navigation back and forth between steps, same mechanism as Phase 6's `localStorage`-backed draft) and is applied identically when the final PDF is generated
- [ ] Sensible defaults out of the box (e.g. technical breakdowns shown by default) so an artisan who never touches this feature sees no behavior change

## Non-goals

- No new data fields and no change to the pricing/redistribution engine — this phase only adds a display-visibility layer on top of what Phases 5–6 already compute.


---