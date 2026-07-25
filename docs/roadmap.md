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

- [x] JWT-based authentication (access + refresh tokens)
- [x] Account creation and login with email/password
- [x] OAuth2 login/signup via Google
- [x] All existing data models (Customer, Invoice, Product, Service) scoped to an owning user/account — no cross-tenant data access, enforced at the query layer, not just the UI
- [x] Migration path for whatever data already exists from the pre-auth single-tenant phases

## Security requirements

- [x] Passwords hashed with a modern algorithm (e.g. argon2/bcrypt), never stored or logged in plaintext
- [x] Refresh tokens revocable (logout invalidates them server-side, not just client-side deletion)
- [x] Standard OAuth2 protections for the Google flow (state parameter, PKCE where applicable, redirect URI allow-list)

## Extended scope (decided during implementation)

Beyond the roadmap draft above, this phase also shipped the full practical/legal surface of a production auth system: "rester connecté" (remember-me), a newsletter opt-in, mandatory CGU/politique de confidentialité consent, non-blocking email verification, password reset, and RGPD self-service account deletion.

## Implementation notes

- **1 User = 1 Company, strictly — no team/multi-user-per-company model.** `User.companyId` is `@unique`; a `Company` row is now only ever created inside `UserRepository.createWithCompany()`'s transaction, alongside its one owning `User`. `User.role` (`ARTISAN`/`ADMIN`) is added now, unused until Phase 14's admin dashboard, specifically so granting admin access later needs no further migration.
- **Tokens live in httpOnly cookies, never a bearer header or localStorage** — decided explicitly with the user given the app handles client/financial data, over the XSS-token-theft risk of any JS-readable storage. Access tokens (JWT, 15 min, `JwtStrategy` reads them via a custom passport-jwt cookie extractor) and refresh tokens (opaque random values, hashed with SHA-256 before being persisted in `RefreshToken` — a DB leak alone can never be replayed) are separate cookies scoped to `/api` and `/api/auth` respectively.
- **Refresh rotation with reuse detection.** `POST /auth/refresh` always revokes the presented token and issues a new one; presenting an *already-revoked* token again is treated as a stolen/leaked-token signal and revokes every session for that user (`RefreshTokenRepository.revokeAllForUser`), not just the one in play.
- **"Rester connecté" is threaded through as a persisted `remembered` boolean on `RefreshToken`**, not inferred from `expiresAt - createdAt` (which would silently break if either constant ever changed) — a rotated token keeps the same remembered-ness as the one it replaced. Unchecked, the refresh cookie is also a browser session cookie (no `Expires`), the "belt" to the short server-side expiry's "suspenders".
- **CSRF: hand-rolled double-submit cookie, not Angular's built-in `withXsrfConfiguration()`.** Angular's own XSRF interceptor silently no-ops for cross-origin requests (`xsrfInterceptorFn` compares `location.origin` to the request's origin) — exactly this app's dev topology (frontend `:4200`, API `:3000`, different origins even though both are "ours"). `frontend/.../xsrf.interceptor.ts` reimplements the same mechanic by reading the cookie directly, without that restriction; `CsrfGuard` (backend) enforces it on every authenticated, state-changing request. The `XSRF-TOKEN` cookie is deliberately `path: '/'` (not `/api` like the other two) — a cookie's `Path` also gates `document.cookie` *readability* from whatever page the browser is on, not just which requests it's attached to, and the SPA's own pages never live under `/api`.
- **Tenant scoping is explicit parameter threading, not a Prisma extension/middleware** — `sourcing.repository.ts` (already `companyId`-scoped pre-Phase-13) was the template every retrofitted repository (`customer`, `product`, `service-catalog`, plus fixing `invoice`'s previously-unenforced read-scoping) copies: every method takes `companyId` explicitly, `findById` uses `findFirst({ where: { id, companyId } })` (never `findUnique`, which would let a cross-tenant id's existence leak through a different error shape), and `update`/`delete` use `updateMany`/`deleteMany` + an affected-count check (`NoRowsAffectedError`) since Prisma's typed `.update()` `where` only accepts unique fields, not an extra `companyId` filter.
- **`Product.code`/`Service.code` uniqueness moved from global to per-company** (`@@unique([companyId, code])`) — now that every artisan has their own catalog, two different artisans using the same SKU-like code is expected, not a conflict.
- **RGPD self-service deletion is one cascading `prisma.company.delete()`.** Every table that hangs off a tenant (`User`, `Customer`, `Product`, `Service`, `Invoice`, `SourcingSearch`, `RefreshToken`, `AuthToken`) now has `onDelete: Cascade` pointed at `Company` (added to `Invoice`'s existing relation too, which had none before). **Known limitation, stated rather than silently built around:** this doesn't yet reconcile with French commercial law's ~10-year invoice retention obligation (Code de commerce art. L123-22) against RGPD's own legal-obligation exception to the right to erasure (GDPR Art. 17.3.b) — an anonymize-but-retain-financial-records flow is a materially bigger feature, deliberately deferred, same honest-reliability-ceiling posture as Phase 10/12's own documented limits.
- **System transactional email (verification, password reset) is a separate credential set (`SYSTEM_SMTP_*`) from Phase 12's `mail-settings`**, which sends invoices from the *artisan's own* address to *their* clients — this is the app's own mailbox. Reuses `MailerService` as-is (it already took `SmtpCredentials` as a plain parameter, never hardcoded to the artisan's account). Optional at boot, same "boots fine without it" posture as `GROQ_API_KEY`: registration/login still work with it unset, verification/reset emails just can't send.
- **Email verification is deliberately non-blocking** — registration auto-logs-in immediately; a persistent (never modal) banner in the nav prompts verification, matching the product's low-friction philosophy over a stricter but more common "verify before you can do anything" pattern.
- **`JWT_ACCESS_SECRET` is the one new required env var** (fails boot like `DATABASE_URL`) — everything else new (`GOOGLE_CLIENT_*`, `SYSTEM_SMTP_*`, `JWT_*` expiry tuning, `FRONTEND_URL`) is optional with sensible defaults, following the existing `GROQ_API_KEY`/`APP_ENCRYPTION_KEY` precedent for opt-in features.
- **`GoogleStrategy` is only registered as a provider when both `GOOGLE_CLIENT_ID`/`SECRET` are set**, checked via `process.env` directly at `AuthModule`'s metadata-evaluation time (before Nest's DI/`ConfigService` exist) — passport strategies throw eagerly from their own constructor otherwise, which would crash boot for a deployment that never configured Google login. `GoogleOAuthEnabledGuard` gives `/auth/google*` a clean 503 instead of passport's raw "unknown strategy" error when unconfigured.
- **`infra/docker-compose.prod.yml`'s `backend` service gained `env_file: - .env`** — it had none before, a pre-existing gap that silently kept `GROQ_API_KEY`/`APP_ENCRYPTION_KEY` (and now every Phase 13 var) from ever reaching the prod container. Fixed as part of this phase since `JWT_ACCESS_SECRET` being unreachable would otherwise crash prod boot outright.
- **e2e tests now authenticate.** A global `JwtAuthGuard` meant every pre-existing e2e spec started 401ing; `test/utils/auth.ts` (`registerTestUser`/`authedRequest`) and `test/utils/test-app.ts` (a shared `createTestApp()` — the specs build their Nest app directly from `AppModule`, bypassing `main.ts`'s real `bootstrap()`, so `cookie-parser` middleware has to be replicated in the test harness too, or `req.cookies` is silently always `undefined` and every request 401s regardless of a correct `Cookie` header) are the shared fix, with each spec's `afterAll` now cleaning up via one `company.delete()` cascade instead of tracking individual row ids.


---

# Phase 13.3 — Public Landing Page (Logged-Out Experience)

## Objective

Build the public-facing part of the site: what a visitor sees before any login or account creation. Today the app has no real front door — this phase gives it one, presenting FactureLeBat clearly, using modern web/marketing conventions and strong calls-to-action, instead of dropping a first-time visitor straight onto a login form.

## Content basis

The actual pitch, target audience, messaging pillars, and CTA language are decided in [positioning.md](positioning.md), a new document created alongside this phase — the same "what we decided and why, implemented here" relationship [design-system.md](design-system.md) has to Phase 9. This phase implements what that document defines; it doesn't redecide the messaging inline.

Core promise (see positioning.md for the full reasoning): *le système de facturation le plus simple, le plus rapide — configurez une seule fois votre environnement de travail (clients, produits, services), puis construisez vos devis et vos factures en un clic. Fini les allers-retours : vous êtes chez le client, vous lui présentez le prix aussitôt, avec le détail de votre prestation selon vos propres critères.*

## Features

- [x] `docs/positioning.md` created: pitch, target audience, messaging pillars, CTA language
- [x] Public landing page reachable without authentication, before Phase 13's login/signup takes over
- [x] Hero section stating the core promise in plain language (one-click devis/factures, configured client/product/service environment, price shown on-site immediately)
- [x] Single, unambiguous primary CTA ("Créer mon compte" / "Essayer gratuitement") leading into Phase 13's signup flow — no competing secondary CTA above the fold
- [x] Visual identity decision made explicitly: extend "Atelier sobre" (design-system.md) to the public site as a new sanctioned spot, or define a distinct one — not a silent reuse of "Chantier calibré," which was built for data entry, not storytelling
- [x] Responsive, modern layout applying the roadmap's own "big buttons, minimum writing" spirit to marketing conventions: clear sections, no dense text walls, room for real screenshots/testimonials later
- [x] Basic SEO (title/meta description, semantic heading structure) — this page is now the site's actual public entry point

## Non-goals

- No pricing page — no tiers exist to describe before Phase 14 (Stripe) defines them.
- No blog/content-marketing system.
- No change to the authenticated app's UI/UX — that's Phase 13.5's scope, not this one.

## Notes

- Sequenced right after Phase 13 (auth) and before Phase 13.5 (quick-invoice UX overhaul): a public marketing page needs at minimum a working signup CTA to point at, which Phase 13 provides; Phase 13.5 is a working-app concern and doesn't depend on this phase at all, but keeping the numbering adjacent reflects that both are UX priorities queued back-to-back right after auth lands.

## Implementation notes

- **The landing page owns `/` outright**, not a segment under `protectedRoutes` — `app.routes.ts`'s old `{ path: '', redirectTo: 'factures/nouvelle' }` (which lived inside the `authGuard`-wrapped children) is gone; a new `guestGuard` (the inverse of `authGuard`) sends an already-signed-in artisan from `/` straight to `/factures/nouvelle` instead of showing them the pitch meant for strangers.
- **`fullBleed` route data + `App.isFullBleed` (a `toSignal` over `Router.events`)** lets this one route opt out of the app shell's `max-w-3xl` content container in `app.html` — every other route is a form/list that wants that width cap, only the landing page needs full-width hero sections.
- **"Atelier sobre" is the visual identity**, per positioning.md's call — a fourth sanctioned spot alongside the PDF header/tour/"Mon activité". `docs/design-system.md`'s Status line ("not yet implemented in frontend") was already stale before this phase — the Tailwind tokens have existed in `styles.css` since Phase 9 — corrected there.
- **CTA buttons deliberately use `bg-primary` (the "Chantier calibré" orange), not an Atelier tone** — the one clickable element on an otherwise calm storytelling page has to pop, and matches the actual button color the artisan clicks everywhere else once signed up.
- **The free-trial section states the trial policy honestly without claiming an enforced paywall**: "1 facture offerte, configuration illimitée, puis abonnement pour continuer" described the intended Phase 14 pricing model at the time this phase was built, not a mechanism this phase itself built — deliberately, rather than half-building a block with no working payment path behind it (decided explicitly with the user). **Now accurate as of Phase 14**: the gate it describes is live (`PremiumGateService`).

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

- [x] Inline product creation defaults to essential fields only: name, unit, price
- [x] "Afficher tout / Compléter la fiche" toggle reveals the remaining Product fields on demand, same form, no separate screen
- [x] A product created via the minimal path is identical in the database to one created via the full form — always fully editable afterwards from "Mes produits"

## Service Pricing Mode: Fixed Price vs Percentage Margin

Add a second way to price a `Service`: instead of always typing a fixed €amount, a slider/toggle on the service form lets the artisan switch it to "Pourcentage" — the service's contribution is computed as a percentage of the invoice rather than entered in cents.

Concrete example (from the user): an artisan creates a service once, named e.g. "Marge 30%", and reuses it on every invoice to apply their markup automatically instead of recalculating it by hand each time.

- [x] "Prix fixe" / "Pourcentage" slider on the Service form
- [x] In percentage mode, the service stores a percentage value instead of `priceCents`; the amount it adds to a given invoice is computed at build time (percentage × base), not typed per invoice
- [x] Percentage services stay compatible with Phase 5's VISIBLE/REDISTRIBUTED choice and integer-cents-only rounding — implementation must define what "base" a percentage applies to (visible product/service lines total is the natural default) and a deterministic, non-compounding order when more than one percentage service is used on the same invoice
- [x] Onboarding tour (Phase 8) update: the artisan is guided to create this exact example — a "Marge 30%" service — as their first practical, reusable service, instead of a generic placeholder example

## Features

- [x] Client-picker screen redesigned as a grid of compact metadata cards, replacing the current list/search-first UI — search/filter stays available for large customer bases
- [x] Clicking a client card advances immediately into line activation, no intermediate confirm step
- [x] Catalog browsing and invoice lines merged into a single screen: each product/service is togglable ("activate"), revealing an inline unit-quantity input the moment it's activated — replaces the separate catalog-picker/line-list split from Phase 11
- [x] Deactivating a toggled item removes its line instantly, symmetric with activation
- [x] Products/services/clients that don't exist yet can still be created inline without leaving the flow, same "autofill, not a lock" creation forms as today (Phases 2/3/5)
- [x] Running total and PDF preview (Phase 6) stay always visible/one click away, now recalculating live per keystroke on an activated line's quantity
- [x] "Envoyer par mail" (Phase 12) reachable directly from the line-activation screen or its preview, without a detour through the invoice list
- [x] Empty or sparse client/catalog data gracefully falls back to today's inline-creation flow — must never block invoicing for a new artisan with nothing saved yet (same guarantee as Phase 11)

## Non-goals

- No change to the pricing/redistribution engine (Phase 5), packaging rounding (Phase 8.5), or the `entryMode` GUIDED/MANUAL split (Phase 9.5) — purely a UI/UX consolidation of mode rapide's existing steps into fewer, denser screens.
- Mode manuel (Phase 9.5) is untouched.
- No new persisted fields expected beyond, at most, light display-only client-card metadata (e.g. a computed "last invoice" indicator) — to be confirmed during implementation, and only if it can be derived rather than stored.

## Notes

- Builds directly on Phase 6 (step-based flow, persistent total/preview), Phase 9.5 (mode rapide vs. manuel split — only mode rapide is touched here), Phase 11 (catalog-driven picker), and Phase 12 (mailing) — this phase merges and simplifies what those phases already built rather than replacing them.
- Sequenced right after Phase 13 (auth) rather than waiting for Phase 14 (Stripe) since it doesn't depend on billing and is a UX priority — same kind of mid-sequence insertion as Phase 8.5.

## Implementation notes

- **A PERCENTAGE service's invoice amount is computed client-side, not in the backend/InvoiceServiceLine pipeline.** `Service.pricingMode`/`percentageBasisPoints` (basis points, same convention as `vatRateBasisPoints`) are the only backend/schema changes; `CreateInvoiceServiceLineDto`/`InvoiceMapper`/`InvoiceService.create` are untouched. This follows the codebase's existing, deliberate pattern (every service-line amount is already a client-supplied snapshot, never re-read from the `Service` row — see Phase 5's "autofill, not a lock") and reuses `calculation-preview.ts`'s already-justified "mirrors the backend for live UX" exception (`computePercentageServiceAmountCents`). `InvoiceDraftStore.resolvedServiceAmountCents`/`percentageBaseCents` compute it live and feed both the running total and the actual create/preview request, so they can never disagree.
- **"Base" for a percentage = raw product-line total (before redistribution) + other FIXED VISIBLE service lines**, deliberately excluding every other PERCENTAGE line's own amount. This sidesteps a circular dependency (a REDISTRIBUTED line's amount is itself folded into product totals) and means several percentage lines on one invoice each compute off the same base rather than compounding — "deterministic, non-compounding" by construction, not by ordering rules.
- **Toggle state (which catalog Product/Service currently has an active line) is tracked via a UI-only `catalogProductId`/`catalogServiceId` field on each line/service-line draft**, not a separately-maintained id→index map — avoids any bookkeeping when a line is removed and every later index shifts. Never sent to the backend (same "UI-only field" precedent as `saveAsNewProduct`).
- **The full per-line form components (`InvoiceLineFormComponent`/`InvoiceServiceLineFormComponent` — waste surcharge, packaging, sourcing panel, redistribution weights) are unchanged and still rendered below the toggle grid.** The toggle row only adds an inline quantity (products) or amount/visibility (services) input bound to the *same* `FormControl` instance, so editing either place stays in sync with zero extra sync code. This is what keeps Phase 5/7/8.5/10's calculation machinery genuinely untouched, per this phase's own non-goal.
- **Clicking a client card advances immediately (no per-invoice address-override step)** — a deliberate reading of "advances immediately, no confirm step." An artisan who needs to correct the client's address for one specific invoice currently has to go back and use "+ Nouveau client" instead of picking the card; flagged here rather than silently decided, since a future phase may want that override restored.
- **Client cards show name/company/address** — no "last invoice date" indicator. `Customer` has no `city` field (just a freehand `address` string) and a real last-invoice indicator needs a new aggregate query; the roadmap listed both as optional/"only if derived," so left out rather than adding a new query or a stored field for this pass.
- **Quick-create CTA buttons and catalog toggle switches use `bg-primary`** ("Chantier calibré," the working app's real accent) — this screen stays in "Chantier calibré," not "Atelier sobre" (Phase 13.3's landing page), since it's transactional data entry, exactly the distinction docs/design-system.md draws.

---

# Phase 14 — Stripe Premium Subscription & Admin

## Objective

Introduce a paid tier: a 15€ premium subscription required after an artisan's first invoice, billed and managed through Stripe. Introduce an admin role to oversee users and grant premium access manually when needed.

## Features

- [x] Stripe integration for subscription billing (checkout, webhooks for payment/renewal/cancellation events)
- [x] Premium gate: free usage up to and including the first invoice, premium subscription required beyond that
- [x] Admin account role, separate from regular artisan accounts
- [x] Admin dashboard to view/search users and their subscription status
- [x] Admin action to grant temporary premium access (e.g. one month) to a specific user, without requiring payment
- [x] Promo code system (e.g. a "premium 1 month" code) redeemable by users to unlock premium temporarily

## Notes

- Depends on Phase 13 (accounts must exist before subscriptions can attach to them).

## Decided with the user before implementation

- **Gate mechanics: "frustrate at the last moment."** Catalog/customer/service configuration stays unlimited regardless of subscription status — the trial is exactly one *created* invoice per company (`Invoice` count, never a separate persisted counter — same "derived data is never persisted" convention as everywhere else). Past that, the paywall only ever fires at the two actions actually reached late in the flow — "Aperçu" and "Créer la facture" — never earlier by disabling the form. Both are gated identically (a 2nd invoice's *preview* is blocked too, not just its persistence).
- **Stripe credentials are optional, like `GROQ_API_KEY`/`APP_ENCRYPTION_KEY`.** The app boots with none of `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_PRICE_ID` set — the free-trial gate still blocks a 2nd invoice, there's just no card-payment path to lift it yet (a promo code or admin grant still can).
- **The first admin account is seeded from an env var (`ADMIN_SEED_EMAIL`) at every boot**, not a self-service "become admin" flow or a one-shot script — deliberately the only way in is something only whoever controls the deployment can set.
- **Promo codes got a full admin CRUD surface**, not just a bare manual-grant action — codes are listable/creatable/deactivatable/deletable from `/admin/codes-promo`, redeemable once per company via `/abonnement`.

## Implementation notes

- **One mechanism, three ways to reach it.** `Company.premiumGrantedUntil` is the single field a Stripe `ACTIVE` subscription, an admin's manual grant, and a redeemed promo code all funnel through in the same way (`BillingRepository.grantPremiumDays` extends it from whichever is later — the current grant if still running, or now — so a second grant stacks instead of resetting the clock). `PremiumGateService.hasPremiumAccess` checks "is either an active Stripe subscription OR a still-valid grant true", never one exclusively — an artisan can be a paying subscriber *and* have a promo month layered on top.
- **`PremiumGateService.assertCanCreateInvoice` is called at the very top of both `InvoiceService.create()` and `.previewPdf()`**, before any other work (customer/service-catalog lookups) — a company past its trial never reaches those for a doomed request. Throws `PremiumRequiredException`, a plain `HttpException` with status 402 and `error: 'PremiumRequired'` — the frontend's two call sites (`invoice-create-shell.page.ts`'s `preview()`, `invoice-create-lines-step.page.ts`'s `submit()`) check specifically for that status to show `PaywallModalComponent` instead of their generic error message.
- **Stripe SDK access is isolated in `StripeClientService`** (`billing/stripe/`), same "isolate the risky external boundary" split as `GroqClientService`/`MailerService` — `BillingService` never touches the SDK directly. `subscription_data.metadata.companyId` is set on checkout so a webhook event can resolve the company even before `stripeCustomerId` would otherwise do it; `applySubscriptionEvent` still falls back to looking the company up by `stripeCustomerId` for events where metadata isn't present.
- **Webhook signature verification needs the exact raw request bytes**, which a normally-JSON-parsed Nest request doesn't preserve byte-for-byte — `main.ts` passes `rawBody: true` to `NestFactory.create`, and `BillingController.webhook` reads `request.rawBody` (a `RawBodyRequest<Request>`) rather than `request.body`.
- **`Stripe.Subscription.current_period_end` no longer exists on this SDK version's Subscription root** — it moved to each `SubscriptionItem`. Since this app only ever creates one line item (the 15€/month price), `applySubscriptionEvent` reads it off `subscription.items.data[0]`.
- **A "Gérer mon abonnement" Stripe customer-portal link was added beyond the roadmap draft above** — decided while building this phase: a subscription system with no way for the artisan to view invoices/update a card/cancel would otherwise need an admin to do all three by hand. `StripeClientService.createPortalSession`/`BillingService.createPortalSession`, surfaced from `/abonnement` once a company has a `stripeCustomerId`.
- **`Product.code`-style per-tenant uniqueness doesn't apply to `PromoCode.code`** — codes are a small, admin-only, cross-tenant catalog (one `PromoCode` table, globally unique `code`, uppercased at generation/redemption so matching is case-insensitive without a DB extension). `PromoCodeRedemption`'s `@@unique([promoCodeId, companyId])` is what actually enforces "once per company" at the DB level, not just the app-side check ahead of it.
- **`AdminRepository`/`AdminController` are their own module, not folded into `AuthModule`** — mirrors this codebase's existing boundary style (`mail-settings/` separate from `mailer/`, `onboarding/` separate from `company/`): `AdminModule` imports `BillingModule` to reuse `BillingRepository.grantPremiumDays`/`PromoCodeService` rather than duplicating that logic. `@Roles(UserRole.ADMIN)` at the controller class level is enough — `RolesGuard` is already global (registered in Phase 13, unused until now).
- **A pre-existing, unrelated schema quirk surfaced while writing this phase's e2e test:** `Invoice.number` is unique across the whole table, not per company (every company defaults to prefix `"F"` starting at 1) — left as-is (out of this phase's scope), the new gate test just gives its throwaway company its own prefix to avoid colliding with the suite's shared one.


---

# Phase 14.3 — Devis or Facture: Document Type Choice

## Objective

"Nouvelle facture" becomes **"Nouveau document"**: right at the entry point, the artisan picks — via a small slider — whether they're producing a **devis** (quote) or a **facture** (invoice). Both use the exact same creation pipeline (Phases 6/7/8.5/9.5/11/13.5); this phase is purely about letting one pipeline produce either kind of document instead of only ever producing invoices.

"Nouveau document" was chosen over "Nouveau devis/facture" or "Créer un document commercial" as the shortest label that doesn't presuppose the type before the artisan has actually picked it — same "write a minimum" instinct behind every other naming choice in this app. "Mes factures" becomes **"Mes documents"** for the same reason: it now genuinely holds both.

## Flow

1. The existing mode-choice screen (Phase 9.5: mode rapide / mode manuel) gains a **Devis / Facture** slider right alongside it — one screen, two independent choices, not an extra step.
2. Everything downstream behaves identically regardless of type; only the PDF's label and the number prefix differ.
3. Finishing a **devis** ends with a prompt: *"Créer la facture aussi immédiatement ?"* — accepting converts it into a real, numbered facture on the spot, using the exact data just confirmed seconds earlier; declining leaves it as a devis, convertible later.
4. **"Mes documents"** shows both types, filterable (Devis / Facture / Tous). Any devis row carries its own **"Créer la facture"** action, usable at any time, not only right after creation.

## Data Model

- `Invoice.documentType: DEVIS | FACTURE`, default `FACTURE` — every invoice created before this phase is retroactively a FACTURE, no behavior change for existing data.
- Independent from `entryMode` (Phase 9.5): a devis can be GUIDED or MANUAL exactly like a facture — two orthogonal discriminators on the same entity, same pattern Phase 9.5 already established.
- Devis and facture get **two separate sequential counters/prefixes** (e.g. `DEV-0001`, `FAC-0001`). French law's gapless-sequential-numbering rule only binds real factures, not devis — but there's no reason to weaken the same guarantee where it isn't legally required; one allocation mechanism, two independent counters, stays simpler than special-casing an unenforced sequence.
- `Invoice.convertedFromDevisId` (optional self-relation): set when a facture is created from a devis, so both documents can show "facture créée depuis le devis n°X" / "converti en facture n°Y" without inferring it from timestamps.

## Features

- [x] "Nouvelle facture" renamed "Nouveau document" everywhere it appears (nav, buttons, onboarding tour copy)
- [x] Devis / Facture slider added to the existing mode-choice screen — no new step in the pipeline
- [x] PDF header/label reflects the chosen type ("DEVIS" vs "FACTURE"); same PDF pipeline otherwise
- [x] Devis numbering is sequential and independent from facture numbering
- [x] End-of-pipeline prompt on a finished devis: "Créer la facture aussi immédiatement ?"
- [x] "Mes factures" renamed "Mes documents", filterable by type (Devis / Facture / Tous)
- [x] "Créer la facture" action available on any devis row in the list, at any time, not just right after creation
- [x] Converting a devis prefills a real facture-creation flow with the devis's client/lines/services (same "autofill, not a lock" rule as every catalog-backed field elsewhere) rather than silently mutating the devis row in place — the devis stays retrievable exactly as it was

## Non-goals

- No devis-specific extras (validity period / "devis valable 30 jours", client acceptance/signature flow, etc.) — this phase only adds the type discriminator and the conversion action. A richer devis-specific feature set is a natural, separate follow-on, not built here.
- No change to the pricing/redistribution/calculation engine — a devis is priced exactly like a facture, it's just not yet a binding one.

## Notes

- **Phase 16's board only makes sense for FACTURE documents** — a devis has no payment state to track. Once this phase lands, Phase 16's board should filter to `documentType = FACTURE`; devis stay in a simpler, non-board list view.
- Builds on Phase 9.5's orthogonal-discriminator pattern (`entryMode`) and Phase 6's "a real number is allocated only at real persistence" rule — a devis gets a genuine number the moment it's created, exactly like a facture always has; nothing about a devis is a draft/preview in Phase 6's sense.

## Implementation notes

- **A devis is, mechanically, an unconsumed facture** — decided explicitly with the user: same `Invoice` row shape, same creation pipeline (`InvoiceService.create`/`previewPdf`/`previewData`), same `PremiumGateService.assertCanCreateInvoice` gate (a devis consumes the same one-invoice free trial a facture would — not a special case). The entire diff is `Invoice.documentType`, the two independent numbering counters, and swapping the handful of hardcoded "Facture" strings (PDF header, downloaded filename, mail subject/signature, a few frontend titles/buttons) for a `documentType`-conditional label — nothing else about the pipeline branches on it.
- **Conversion creates a second `Invoice` row, never mutates the devis in place.** `InvoiceService.convertToFacture` rebuilds a `CreateInvoiceData` from the devis's already-persisted lines/serviceLines/manualTable/customerFields (not a fresh DTO — nothing is re-typed or re-validated) and calls the same `createWithSequentialNumber` create() uses, with `documentType: FACTURE` and `convertedFromDevisId` set. `Invoice.convertedFromDevisId` is `@unique` (a devis converts into at most one facture); the inverse `convertedToFacture` relation is what a devis's own view uses to show "facture créée depuis ce devis" once it has been.
- **The Devis/Facture choice is carried from the mode-choice screen to whichever mode is picked via a `?type=` query param** (`InvoiceCreateModeChoicePage`'s `routerLink` `queryParams`), read once by `InvoiceCreateShellPage`/`InvoiceCreateManualPage` at construction and handed to `InvoiceDraftStore`/`ManualInvoiceDraftStore.setDocumentType()` — deliberately only when the param is present, so resuming an in-progress draft via a direct/bookmarked link (no query param) never silently flips it back to FACTURE.
- Migrations for this phase and Phase 14.5 were generated non-interactively (`prisma migrate diff --from-config-datasource --to-schema` + a hand-placed `migration.sql`, then `prisma migrate deploy`) since `prisma migrate dev` refuses to run outside an interactive terminal.

---

# Phase 14.5 — Findable Clients: Richer Customer Search

## Objective

An artisan doesn't always remember a client's name — and once the customer base grows, name alone stops being enough to find them at all. This phase makes customer search/sorting surface the things an artisan actually remembers instead: roughly when they last quoted or invoiced this client, their address, or a word from a description the artisan wrote about them.

## Data Model

- `Customer.description` (optional, freeform text) — new field, same "autofill, not a lock" spirit as everywhere else: entirely optional, freely editable at any time from the customer form. This is the field Phase 2's Customer entity didn't have and this phase's word-matching depends on.
- No other new persisted field. "Date du dernier devis" / "dernière facture" are derived from existing `Invoice` rows (latest per customer, split by `documentType` if Phase 14.3 has landed) at read time — same "derived data is never persisted" rule used throughout (invoice totals, Phase 5's redistribution, Phase 16's overdue column). Caching a duplicate date on `Customer` would just be a value that can silently drift from the `Invoice` table it's summarizing.

## Search & Results

- Search matches across name, company name, address, and description — not name alone.
- Each result surfaces what actually helps recognition: last devis date, last facture date, city/address, and — when a match came from the description rather than the name — the matching snippet, so the artisan sees *why* a result matched, not just that it did.
- Sort options beyond today's alphabetical: most recently invoiced, most recently quoted, most recently created — useful for the very common "who was I at two weeks ago" recall.

## Features

- [x] `description` field added to `Customer` (optional, freeform), editable from the customer form like every other optional field
- [x] Customer search matches name, company name, address, and description — not name-only
- [x] Search results show last devis date and last facture date per customer, computed from `Invoice`, never stored
- [x] Matching description snippet shown/highlighted in results when the match came from free text
- [x] Sort toggle: alphabétique / dernière facture / dernier devis / date de création
- [x] Customers with no description or no invoice history yet degrade gracefully (blank/"—"), never an error — must not break for a brand-new customer with zero history

## Non-goals

- No fuzzy/typo-tolerant matching — plain substring search across the four fields, consistent with how Phase 11's catalog search already works (`code`/`name` OR clause). Revisit only if real usage shows this insufficient.
- No customer tagging/categorization system — description is freeform text, not a structured taxonomy; that would be a bigger, separate feature.

## Notes

- Builds on Phase 2 (Customer entity) and reuses the plain filter pattern already established for catalog search (Phase 11's implementation notes) rather than introducing new search infrastructure.
- If Phase 14.3 hasn't landed yet when this is built, ship with a single "dernier document" date instead of two — trivially split later once `documentType` exists.

## Implementation notes

- **Phase 14.3 landed first (see build order), so both dates ship directly** — `CustomerRepository.findLastDocumentDatesByCustomer` groups `Invoice` by `customerId`/`documentType` in one query (`_max: { date }`) for every customer `findAll` already loaded, rather than N+1 per-customer lookups.
- **The computed fields (`lastDevisDate`/`lastFactureDate`/`matchSnippet`) live on a new `CustomerSearchResult` type, not on `CustomerProfile` itself** — `findById`/`create`/`update` keep returning the plain `CustomerProfile` (a straight `CustomerModel` alias); only `GET /customers` needs the computed shape, so only that endpoint's return type changed.
- **Sorting happens in application code, not SQL** — `CustomerService`'s `sortCustomers` sorts the already-fetched (≤500, per `CustomerRepository.MAX_LISTED_CUSTOMERS`) array in memory. Ordering by a computed aggregate (last invoice date) isn't expressible as a plain Prisma `orderBy`, and at this scale an in-memory sort costs nothing worth optimizing for — consistent with this module's existing "no pagination yet" simplicity.
- **The description snippet only appears when the match didn't already come from a fixed field** — `CustomerService.findAll` checks name/companyName/address first; a snippet is built (40 chars of context each side of the match, ellipsized) only when none of those matched but `description` did, so the artisan isn't shown a redundant snippet next to a name that already visibly matched.

---

# Phase 14.7 — Bug Reports (Claude)

## Objective

Two bugs surfaced by Claude while working on other tasks, logged here for triage rather than fixed inline (both out of scope for the task that found them).

## Bugs

- [x] **Anonymous visitor bounced off `/inscription`/`/connexion` — fixed.** Root cause confirmed: `App`'s root component injects `TourService` (`providedIn: 'root'`) on every route including public ones; its constructor fires `GET /api/onboarding` unconditionally, which 401s when anonymous; `authRefreshInterceptor`'s refresh-then-retry also fails (no session to refresh) and was unconditionally navigating to `/connexion` regardless of where the visitor already was. Fix: `authRefreshInterceptor` now checks the current route against the exact list of public routes in `app.routes.ts` (outside the `authGuard`-wrapped tree) before redirecting — a failed background call on a route that never needed a session in the first place no longer forces a navigation away from it. `TourService`'s onboarding subscribe also got an explicit no-op `error` handler, so the same failure stops surfacing as an unhandled rejection for an anonymous visit.
- [x] **`POST /api/invoices/preview` 400 on manual-table validation — triaged, not a bug.** Confirmed by reading `InvoiceCreateManualPage.preview()`: deliberately not gated on `store.canPreview()` (the comment states this explicitly) — mode manuel's whole principle is that the artisan can preview at any point, even an empty/incomplete draft, and an incomplete submission's 400 is expected, already caught, and surfaced as a generic "Impossible de générer l'aperçu pour le moment." rather than a crash. The logged 400 is that exact by-design path (an artisan clicking "Aperçu" before filling in the table), not a validation gap reaching the API unexpectedly. No code change.

<details>
<summary>Raw log excerpt</summary>

```
2026-07-23 13:25:18.161 INFO  [b99984c3] [HTTP] GET /api/company 304 23.4ms {"ip":"::ffff:192.168.65.1"}
2026-07-23 13:25:26.732 DEBUG [7cb7fc33] [PrismaService] SELECT "public"."Company"."id", "public"."Company"."name", "public"."Company"."siret", "public"."Company"."addressLine1", "public"."Company"."addressLine2", "public"."Company"."postalCode", "public"."Company"."city", "public"."Company"."email", "public"."Company"."phone", "public"."Company"."legalStatus"::text, "public"."Company"."vatRateBasisPoints", "public"."Company"."invoiceNumberPrefix", "public"."Company"."nextInvoiceNumber", "public"."Company"."tourEnabled", "public"."Company"."completedTours", "public"."Company"."smtpHost", "public"."Company"."smtpPort", "public"."Company"."smtpSecure", "public"."Company"."smtpUser", "public"."Company"."smtpPasswordEncrypted", "public"."Company"."stripeCustomerId", "public"."Company"."stripeSubscriptionId", "public"."Company"."subscriptionStatus"::text, "public"."Company"."currentPeriodEnd", "public"."Company"."cancelAtPeriodEnd", "public"."Company"."premiumGrantedUntil", "public"."Company"."createdAt", "public"."Company"."updatedAt" FROM "public"."Company" WHERE ("public"."Company"."id" = $1 AND 1=1) LIMIT $2 OFFSET $3 -- 3.60833299998194ms {"params":"[\"4abb9785-b91c-4877-a747-226dbe93df74\",\"1\",\"0\"]"}
2026-07-23 13:25:26.735 INFO  [7cb7fc33] [HTTP] GET /api/company 304 29.1ms {"ip":"::ffff:192.168.65.1"}
2026-07-23 13:25:31.480 INFO  [196bd87d] [HTTP] OPTIONS /api/invoices/preview 204 0.8ms {"ip":"::ffff:192.168.65.1"}
2026-07-23 13:25:31.496 WARN  [91f51eb9] [AllExceptionsFilter] POST /api/invoices/preview -> 400 customerName must be longer than or equal to 1 characters; manualTable.each manual row must supply exactly one cell per column, a non-empty description, and a valid non-negative unit price/line total (or a blank line total)
2026-07-23 13:25:31.497 WARN  [91f51eb9] [HTTP] POST /api/invoices/preview 400 14.6ms {"ip":"::ffff:192.168.65.1"}
```

</details>

# Phase 15 — Mandatory Preview & Customizable Line Detail

## Objective

Preview (Phase 6) stops being optional: the artisan must go through it before the invoice is created for real (persisted + numbered, per Phase 6's implementation notes) — the "Créer la facture" action is only reachable from the preview screen, not directly from the lines step.

On that preview, some pieces of information are highlighted on hover and are click-toggleable: the artisan can show or hide them on the generated PDF, per invoice. Example: an artisan may not want the m² detail (or m³, or any other technical breakdown) to appear to the client, while still needing it computed under the hood for the total to be correct.

## Behavior

- The underlying calculation is never affected by hiding a field — hiding is purely a display/PDF-rendering concern, the totals and stored data stay exactly as computed (same principle as Phase 5's visible/redistributed service lines: what's hidden from the document is not the same as what's absent from the data).
- Toggles are per-field, per-invoice — not a global setting — since what an artisan wants to show varies invoice to invoice depending on the client.

## Features

- [x] "Créer la facture" (final, persisted PDF) is only accessible from the preview screen; the lines/services step no longer offers a direct path to creation
- [x] Preview highlights toggleable pieces of information on hover (e.g. per-line technical detail such as m²/m³ breakdown, waste surcharge detail)
- [x] Click-to-hide / click-to-show on each toggleable piece of information, live-updating the preview
- [x] Hidden/shown state per field persists for that invoice's draft (surviving navigation back and forth between steps, same mechanism as Phase 6's `localStorage`-backed draft) and is applied identically when the final PDF is generated
- [x] Sensible defaults out of the box (e.g. technical breakdowns shown by default) so an artisan who never touches this feature sees no behavior change

## Non-goals

- No change to the pricing/redistribution engine — this phase only adds a display-visibility layer on top of what Phases 5–6 already compute.
- Mode manuel (Phase 9.5) is untouched: the mandatory-preview gating and the toggle UI are both mode-rapide-only. Manual mode's canvas is already its own real-time, PDF-like editing surface (Phase 9.5's whole premise), and it has no computed technical fields (unit/waste-surcharge/packaging note) to toggle in the first place — inserting a second, separate preview step ahead of its existing single-page submit would have fought that mode's own design rather than extended it.

## Decided/discovered during implementation

- **Preview is an HTML mirror of the document, not the real rendered PDF, and it's a routed step, not a modal.** The roadmap's "highlighted on hover, click-to-toggle" behavior needs DOM access to individual fields — the pre-existing Phase 6 preview (`PdfPreviewModalComponent`, a `<embed>`-style iframe over a real generated PDF blob) has no such access. `InvoiceCreatePreviewStepPage` is a third routed child of the shell (`factures/nouvelle/rapide/apercu`, after `client`/`lignes`), rendering plain Tailwind/HTML laid out to resemble the PDF (same fields, same order), fed by real backend-computed numbers rather than reimplementing `InvoiceCalculationService`. Making it a routed step rather than a modal is also what makes "only reachable from here" a real routing fact, not just a UI convention: the lines step's old `submit()` (creation) and success-state (download/email/"nouvelle facture") moved here wholesale; the lines step now only validates and navigates (`goToPreview()`).
- **A new JSON endpoint, `POST /invoices/preview-data`, feeds the mirror — no client-side recomputation.** `InvoiceMapper.toPreviewInvoiceWithTotals()` (GUIDED) / `toManualPreviewInvoiceWithTotals()` (unused by this phase but kept symmetric with the PDF-preview pair) return the same `InvoiceWithTotals` shape `GET /invoices/:id` already exposes, computed positionally off the not-yet-persisted `CreateInvoiceDto` — the exact "Phase 6 preview" pattern, just returned as data instead of already-formatted PDF strings. `toPreviewPdfData`/`toManualPreviewPdfData` were refactored to build on top of these (compute once, reshape for PDF — the same relationship `toPdfData` already has with `toInvoiceWithTotals`), so the HTML mirror and the literal PDF can never disagree on a number. Gated by `PremiumGateService.assertCanCreateInvoice` identically to the existing `previewPdf`/`create` — reaching this screen with the free trial already used shows the paywall immediately, before any figure renders.
- **Toggle state is two new persisted booleans per line (`InvoiceLine.showUnitDetail`/`showBillingDetail`, both `@default(true)`), not purely ephemeral UI state**, despite this section's original "no new data fields" framing — decided during implementation: without persisting the artisan's choice, re-downloading or re-emailing (Phase 12) the invoice later would silently revert to showing everything, contradicting "is applied identically when the final PDF is generated." Same kind of deliberate snapshot as `Invoice.vatApplicable` (see conventions.md) — an artisan decision worth protecting from drifting back, not a cache. Threaded through `CreateInvoiceLineDto` → `InvoiceRepository` → `InvoiceMapper.toPdfData()`/`toPreviewPdfData()`, which blank the "Unité" cell / omit the "(facturé : X)" note per line exactly as Phase 8.5 already renders that note — the toggle never touches `InvoiceCalculationService` or any stored total.
- **Toggle granularity is per-line, not one invoice-wide flag per detail kind** — decided explicitly with the user: an artisan with several lines may want to hide the packaging-rounding note on one material without hiding the unit column everywhere. `InvoiceDraftStore.toggleLineDetail(index, field)` flips one line's field directly on the draft (persisted the same `localStorage` way as every other draft field); `InvoiceLineFormComponent`'s form group carries the two booleans as inert controls (not rendered there) purely so the lines step's existing `valueChanges → setLines()` sync doesn't clobber them back to their default whenever an unrelated field on that line changes.
- **The shell's own bottom-bar "Aperçu" button survives, now as a plain `router.navigate` to `apercu`** (no longer fetching a PDF itself) **and hides itself while already on that step** (`InvoiceCreateShellPage.isOnPreviewStep()`) — otherwise it sat there redundantly next to the preview screen's own "Créer la facture", one tap away from re-navigating to where the artisan already was. Caught during manual browser verification, not by the build or unit tests.

# Phase 16 — Invoice Lifecycle Board (Payment Status & Follow-Up)

## Objective

Give the artisan a working view of "mes factures" as a lifecycle, not just a flat list: a Kanban-style board where an invoice card lives in a column reflecting whether it's been paid, and moves between columns by drag & drop. Each card also exposes the actions that actually matter for the state it's in — most importantly, re-sending the invoice email to a client who hasn't paid yet — so following up on unpaid work stops requiring the artisan to remember who owes what.

This phase is a payment/status *tracker*, not a payment *collector* — see Non-goals.

## Data Model

- `Invoice.status: InvoiceStatus` (`NON_PAYEE | PAYEE | ANNULEE`, default `NON_PAYEE` on creation) — a real, artisan-controlled lifecycle field, changed either by dragging a card to another column or by a card's action button. Deliberately **not** four values — see below for why "en retard" isn't one of them.
- `Invoice.dueDate` (optional) — the date the client committed to paying by. Not asked at invoice creation (the artisan rarely knows it yet at that point); instead captured lazily, the first time it's actually needed (see Board UX's drop-into-"Non payées" modal).
- `Invoice.paidAt` (optional) — set when a card is marked/dragged to `PAYEE`; cleared if moved back out. Same "records the fact, not a log" convention as Phase 12's `sentAt`.
- `Invoice.lastReminderAt` (optional) — overwritten on every "renvoyer un mail" click, same single-field convention as `sentAt`/`sentToEmail` (Phase 12): "was a reminder ever sent, and when most recently" is all the board needs, not a full history table.

**"En retard" is a real column in the UI, but still not a fourth persisted status.** The board shows four columns (Non payées, En retard, Payées, Annulées), but the database only ever stores three status values — "en retard" is `NON_PAYEE` cards whose `dueDate` has passed, bucketed into that column at read time, the same way invoice totals and Phase 5's redistribution splits are already computed on the fly rather than stored (conventions.md's "derived data is never persisted" rule). This gets the user's idea of a real, visible column without needing a background job to flip a status overnight — a card simply renders in "En retard" the moment `dueDate` is in the past, correct on every page load with zero scheduled task. It also means there's nothing to reconcile if the artisan hasn't opened the app in days — the very next visit renders it correctly.

## Board UX

- Four columns: **Non payées**, **En retard**, **Payées**, **Annulées**. Cards reuse the same compact-card visual language introduced for client cards in Phase 13.5, for consistency across the two card-based screens the app will now have.
- Drag & drop between columns updates `status` immediately (optimistic UI, reconciled against the backend response) — reuses `interactjs`, already a dependency since Phase 9.5's resize handles, rather than adding a second drag library for a second kind of drag interaction.
- **Dropping a card into "Non payées" without a `dueDate` yet opens a small modal**: "Pour quelle date le client s'est-il engagé à payer ?" — one field, one date picker, no other input. This is the artisan recording a commitment the client already made verbally/on-site, not inventing a policy; skipping it is allowed (the invoice just stays in "Non payées" indefinitely with no overdue tracking until a date is eventually set, editable later from the card itself).
- **"En retard" is not a manual drop target.** A card gets there on its own once `dueDate` passes while still `NON_PAYEE` — dragging *into* "en retard" isn't a meaningful artisan action, so the column only ever accepts drags back out (to "Payées" once the client finally pays, or "Annulées"). Dragging *out* of "En retard" behaves exactly like dragging out of "Non payées", since it's the same underlying status.
- **Every drag action has an equivalent tap/click action.** The target user works from a phone, often with gloves, standing on a job site (same reasoning as Phase 7's tooltip-not-hover decision) — drag-and-drop alone would be actively hostile on that hardware. Each card carries explicit buttons ("Marquer payée", "Annuler la facture", "Remettre en non payée") that do exactly what the equivalent drag would do, including triggering the due-date modal where relevant.
- A card in **En retard** is visually flagged (design-system.md's `danger` semantic color) and its "Renvoyer un mail" button is emphasized — the board should make "who do I need to chase this week" answerable at a glance, without opening every invoice.
- Card actions by column:
  - **Non payées**: "Renvoyer un mail" (reuses Phase 12's mailing pipeline as-is, prefilled recipient/template), "Marquer payée", "Annuler la facture"
  - **En retard**: same actions as Non payées, with "Renvoyer un mail" visually emphasized
  - **Payées**: "Télécharger le PDF" — no reminder actions, nothing left to chase
  - **Annulées**: "Restaurer" (back to Non payées) — no permanent delete from the board itself
- Filter/search the board by client name or date range for artisans with a large invoice history — the board must stay usable past a few dozen cards, not just in the empty-state screenshot.

## Features

- [ ] `InvoiceStatus` field added to `Invoice` (`NON_PAYEE | PAYEE | ANNULEE`), plus `dueDate`, `paidAt`, `lastReminderAt`
- [ ] "Mes factures" replaced/complemented by a four-column board: Non payées, En retard, Payées, Annulées
- [ ] Drag & drop a card between columns updates its status; every drag has an equivalent button-based action for touch/glove use
- [ ] Dropping/moving a card into "Non payées" without a `dueDate` set opens a one-field modal asking the date the client committed to paying by; skippable, editable later from the card
- [ ] "En retard" is computed (`NON_PAYEE` + `dueDate` passed) and rendered as its own column, never a manually-droppable target or a fourth persisted status
- [ ] "Renvoyer un mail" button on an unpaid/overdue card, reusing Phase 12's mail-sending pipeline and template, visually emphasized once overdue
- [ ] "Marquer payée" / "Annuler la facture" / "Restaurer" quick actions available directly from a card
- [ ] Board is filterable/searchable by client and date, so it stays usable as invoice volume grows
- [ ] Existing invoices (pre-Phase-16) default to `NON_PAYEE` with no `dueDate` — sit in "Non payées", never crash or misrender for lack of a due date, and only reach "En retard" once one is eventually set and passes

## Non-goals

- **No online payment collection, and no client-facing surface at all.** FactureLeBat's board is a tool for the artisan alone — the client never sees it, logs into it, or interacts with it. "Marquer payée" is the artisan recording a fact (they were paid by check, transfer, cash on-site), not a payment gateway charging the end client. Actually collecting money online would mean building a client-facing checkout/portal, which is a different product surface entirely and out of scope here — not to be confused with Phase 14's Stripe integration, which bills the *artisan's own* FactureLeBat subscription, not their clients.
- **No reminder scheduling/automation.** "Renvoyer un mail" stays a manual, one-click action the artisan chooses to take — no automatic recurring dunning emails in this phase.
- **No partial payments.** An invoice is either paid or not; splitting a paid amount across multiple installments is a different, bigger data model and isn't asked for here.

## Notes

- Builds on Phase 12 (reuses the mailing pipeline as-is) and borrows the card visual language from Phase 13.5, but doesn't depend on either being complete first — the board is additive to whatever "mes factures" looks like today.
- Cross-reference: Phase 15's per-invoice PDF field visibility and this phase's status board are independent concerns (one is about what a client sees, the other is about what the artisan tracks) and don't interact.
- If Phase 14.3 (devis/facture split) has landed by the time this is built, the board scopes to `documentType = FACTURE` only — a devis has no payment state to track, and stays in its own simpler list instead of occupying a board column.

---

# Phase 17 — Quarterly Reports & Activity Analytics

## Objective

Turn the invoice history FactureLeBat already holds into two things an artisan actually needs but currently has to reconstruct by hand: a **quarterly report** shaped for their URSSAF/tax declaration (the reality for a French *auto-entrepreneur*, who must declare turnover every quarter or month), and an **activity dashboard** — the "business insights" goal named in this roadmap's own Product Vision from day one, not yet built.

## Why cash-basis, not invoicing date

URSSAF/tax declarations for a micro-entrepreneur are based on *encaissements* — money actually received — not on when an invoice was issued. An invoice created in March but paid in April counts toward Q2, not Q1. This is exactly why this phase depends on Phase 16: without a real `PAYEE` status and `paidAt` date, there would be no reliable way to know when money actually came in, only when it was invoiced — and building the report on invoicing date instead would hand the artisan a number that's simply wrong for what they're required to declare. Every figure in this phase is computed off `paidAt`, never `createdAt`/invoice date.

## Data Model

- `Company.declarationFrequency` (`MENSUELLE | TRIMESTRIELLE`, default `TRIMESTRIELLE`) — which period the report screen defaults to; a real choice auto-entrepreneurs make at registration.
- `Company.microEntrepreneurCeiling` (optional, integer cents) — an artisan-editable threshold for the plafond warning below, deliberately **not** a hardcoded legal constant: the actual ceiling depends on activity type and changes over time, and baking in a number the app can't guarantee is current would be worse than not showing one. Left blank, the warning simply doesn't appear.
- `Product.activityCategory` / `Service.activityCategory` (optional: `VENTE_MARCHANDISES | PRESTATION_BIC | PRESTATION_BNC`, default unset) — artisan-set, since only they know which URSSAF category their own registration puts each item under. Report totals bucket by this field, with an explicit "non catégorisé" bucket for anything left unset, so nothing is silently mis-bucketed.
- The report itself is **not a stored entity** — computed on demand from `PAYEE` invoices whose `paidAt` falls in the selected period, same "derived data is never persisted" convention as invoice totals, Phase 5's redistribution, and Phase 16's overdue column. Nothing to keep in sync, nothing that can drift from the underlying invoices.

## Features — Quarterly Report

- [ ] Report screen: pick a period (quarter or month, per `declarationFrequency`; a custom range too) and see total encaissé for that period
- [ ] Totals broken down by `activityCategory`, plus a visible "non catégorisé" bucket when items haven't been tagged
- [ ] List of the individual paid invoices that make up the total (client, amount, `paidAt`) — an audit trail the artisan can cross-check against, not just a bare number to trust blindly
- [ ] Export the report as PDF (reuses the existing `PdfService` pipeline) and as CSV (for pasting into a spreadsheet or handing to an accountant)
- [ ] Optional plafond warning: a progress indicator comparing year-to-date encaissements against `microEntrepreneurCeiling`, shown only when that field is set

## Features — Activity Analytics

- [ ] Revenue-over-time chart (encaissé, by month, last 12 months)
- [ ] Top clients by revenue, top products/services by revenue and by frequency
- [ ] Outstanding total: sum of `NON_PAYEE` + `En retard` invoices (Phase 16), so the artisan sees "billed but not yet collected" alongside what's actually been received
- [ ] Basic activity counters: invoice count, average invoice value, count of active clients/products
- [ ] Hosted in "Mon activité" (Phase 9's existing "Atelier sobre" section, company settings) — the sanctioned spot where the app already speaks about the artisan's business rather than asking for fast data entry, extended rather than duplicated with a new screen

## Non-goals

- **No e-filing / URSSAF API integration.** The artisan still enters the figure on the official portal themselves; this phase produces the correct number and a paper trail, not a submission.
- **No tax advice, no rate computation.** The app reports categorized turnover — it does not calculate cotisations owed, apply rates, or account for ACRE/exemptions. Matches the same honesty principle already applied to Phase 10 (sourcing) and Phase 12 (mail delivery): the app states what it can verify from its own data and stops there.
- **No expense/charge tracking.** FactureLeBat only knows the revenue side (invoices); a full accounting picture (deductible expenses, etc.) is a materially different feature and out of scope here.
- **No automatic activity-category detection.** Guessing VENTE vs. PRESTATION from a product/service name risks being confidently wrong on exactly the field that determines a real declaration — left to explicit artisan input instead.

## Notes

- Depends on Phase 16 for `paidAt`/status — sequenced after it for that reason, not just numbering convenience.
- Cross-reference: this roadmap's own Product Vision has named "business insights" as a long-term goal since the very first draft; this phase is the first concrete delivery of that promise.

---