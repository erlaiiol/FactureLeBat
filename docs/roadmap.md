# FactureLe Roadmap

## Product Vision

FactureLe is a SaaS application designed for small businesses that need to manage quotes and invoices. Construction artisans and independent contractors are the primary, most obvious target — but not the only one the product is built for.

The initial goal was to help flooring installers create professional invoices quickly.

The long-term goal is to provide a complete business management platform, starting from artisans' needs but growing beyond that niche:

- product catalog management
- supplier data extraction
- quote and invoice generation
- customer management
- project tracking
- business insights

The product must remain simple enough for non-technical users. The UI must be clear. The UX must be the fastest with big buttons. We must write a minimum. We must click a maximum.

**Scaling beyond a small artisan app:** the product is actively being scaled past its original "flooring installer" niche toward a broader platform — small features that let a document flex to more real-world situations (e.g. per-invoice VAT treatment, not just a fixed company-wide default) are part of that push, not scope creep. Artisans stay the default persona for UX decisions (simple, fast, big buttons, minimal typing), but features shouldn't be scoped as if they were the only user. The product renamed from **FactureLeBat** to **FactureLe** on 2026-07-26 to reflect this broader scope.

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

FactureLe extracts:

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

## Later addition — VAT applicability/rate editable per manual invoice

Manual mode's own principle ("nothing computed behind the artisan's back," already applied to Sous-total HT/TVA/Total TTC as freely overridable figures) extended to VAT itself: `CreateInvoiceDto.vatApplicableOverride`/`vatRateBasisPointsOverride` let a single manual invoice pick "TVA non applicable" or a specific rate (5,5 % / 10 % / 20 % — the real French rates relevant to construction work; there is no 15 % rate, and 2,1 % is irrelevant to this app's audience), overriding the company profile's own default (`Company.legalStatus`/`vatRateBasisPoints`) for that one document. Forbidden for `entryMode` GUIDED, same as the three totals overrides — VAT there stays purely derived from the company profile.

**Decided during implementation, after flagging the legal nuance to the user:** the company's own default regime (derived from `legalStatus`) is not itself editable anywhere — only a manual invoice's *effective* treatment for that one document can diverge from it. Because that means a VAT-registered company can mark one invoice "TVA non applicable" (or the reverse for a franchise-en-base micro-entrepreneur), `PdfService`'s legal mention had to stop assuming the two always match: `InvoiceMapper.issuerFields` now also carries `companyVatExempt` (the company's own real status, independent of the invoice's resolved `vatApplicable`), and only cites "art. 293 B du CGI" when that's true — a company that overrides one invoice away from its own regime gets the plain "TVA non applicable" mention instead, never a false legal citation. `InvoiceTotalsSummaryComponent`'s VAT line, editable-mode only, carries a small "ⓘ" (native `<details>/<summary>`, no extra state) showing the company's real legal status and default regime, so the override is always made with that context visible.

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
- [x] Default message template that mentions FactureLe (product visibility for the artisan's own clients seeing where the invoice came from), editable before sending
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

Turn FactureLe from a single-artisan tool into a real multi-user SaaS: every artisan gets their own isolated customers/invoices/products/services, behind secure login.

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

Build the public-facing part of the site: what a visitor sees before any login or account creation. Today the app has no real front door — this phase gives it one, presenting FactureLe clearly, using modern web/marketing conventions and strong calls-to-action, instead of dropping a first-time visitor straight onto a login form.

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

- [x] `InvoiceStatus` field added to `Invoice` (`NON_PAYEE | PAYEE | ANNULEE`), plus `dueDate`, `paidAt`, `lastReminderAt`
- [x] "Mes factures" replaced/complemented by a four-column board: Non payées, En retard, Payées, Annulées
- [x] Drag & drop a card between columns updates its status; every drag has an equivalent button-based action for touch/glove use
- [x] Dropping/moving a card into "Non payées" without a `dueDate` set opens a one-field modal asking the date the client committed to paying by; skippable, editable later from the card
- [x] "En retard" is computed (`NON_PAYEE` + `dueDate` passed) and rendered as its own column, never a manually-droppable target or a fourth persisted status
- [x] "Renvoyer un mail" button on an unpaid/overdue card, reusing Phase 12's mail-sending pipeline and template, visually emphasized once overdue
- [x] "Marquer payée" / "Annuler la facture" / "Restaurer" quick actions available directly from a card
- [x] Board is filterable/searchable by client and date, so it stays usable as invoice volume grows
- [x] Existing invoices (pre-Phase-16) default to `NON_PAYEE` with no `dueDate` — sit in "Non payées", never crash or misrender for lack of a due date, and only reach "En retard" once one is eventually set and passes

## Non-goals

- **No online payment collection, and no client-facing surface at all.** FactureLe's board is a tool for the artisan alone — the client never sees it, logs into it, or interacts with it. "Marquer payée" is the artisan recording a fact (they were paid by check, transfer, cash on-site), not a payment gateway charging the end client. Actually collecting money online would mean building a client-facing checkout/portal, which is a different product surface entirely and out of scope here — not to be confused with Phase 14's Stripe integration, which bills the *artisan's own* FactureLe subscription, not their clients.
- **No reminder scheduling/automation.** "Renvoyer un mail" stays a manual, one-click action the artisan chooses to take — no automatic recurring dunning emails in this phase.
- **No partial payments.** An invoice is either paid or not; splitting a paid amount across multiple installments is a different, bigger data model and isn't asked for here.

## Notes

- Builds on Phase 12 (reuses the mailing pipeline as-is) and borrows the card visual language from Phase 13.5, but doesn't depend on either being complete first — the board is additive to whatever "mes factures" looks like today.
- Cross-reference: Phase 15's per-invoice PDF field visibility and this phase's status board are independent concerns (one is about what a client sees, the other is about what the artisan tracks) and don't interact.
- If Phase 14.3 (devis/facture split) has landed by the time this is built, the board scopes to `documentType = FACTURE` only — a devis has no payment state to track, and stays in its own simpler list instead of occupying a board column.

## Decided during implementation

- **A 5th real column, "Devis" — not "stays in its own simpler list."** Decided explicitly with the user, overriding this phase's own "Notes" draft above: Phase 14.3 had already landed, but a devis is conceptually a "pré-facture" to this artisan, so it earns a real board column (view + "Télécharger le PDF") rather than being pushed back to a separate flat list. For every devis not yet converted, a lightweight **ghost card** also appears in "Non payées" — one field, one action ("Créer la facture", reusing Phase 14.3's existing `convertToFacture` as-is) — so the eventual facture's slot is visible before the facture exists. It's replaced by the real facture card once conversion happens. Never draggable, never counted as its own status.
- **The board replaces "Mes factures" outright, no list/board toggle** — the user's own framing: "une plateforme de gestion hyper facile... en particulier [sur] mobile", so one screen to learn, not two.
- **Filters are client-side over the already-loaded (200-cap) list, same as the pre-existing Tous/Devis/Facture toggle** — no new query params on `GET /invoices`. Date filter is invoice **date d'émission** (`Invoice.date`), plus a one-tap "Non payées uniquement" toggle that hides the Devis/Payées/Annulées columns entirely (less to scroll through on a phone), leaving Non payées + En retard.
- **`lastReminderAt` piggybacks on the existing mail-send call, no new endpoint.** `InvoiceMailService.send` passes `bumpReminder: raw.status === NON_PAYEE` down to `InvoiceRepository.markSent`, which stamps `lastReminderAt` in the same `updateMany` write as `sentAt` — "renvoyer un mail" on the board is exactly the same button/call as Phase 12's original send, tracking is invisible plumbing underneath it.
- **One endpoint, `PATCH /invoices/:id/status`, covers both a real status change and a due-date-only edit** (send the unchanged `status` + a new `dueDate`) — `InvoiceService.updateStatus` rejects anything but a FACTURE (`documentType !== FACTURE` → 400), sets `paidAt` on entering `PAYEE` and clears it on leaving `PAYEE` for any other status, and never clears `dueDate` when the request omits it (a drag that isn't about the due date must not silently wipe a previously-set one).
- **"Restaurer" (Annulées → Non payées) funnels through the exact same due-date-modal path as a drag into Non payées** — if the invoice has no `dueDate` yet, restoring asks for one too, rather than being a silent status flip with different rules than the drag equivalent.
- **Drag & drop is a thin, hand-built `interactjs` wrapper** (`invoice-card-drag.directive.ts`), same "small owned primitive" precedent as Phase 9.5's `ManualResizeHandleDirective`: tracks a CSS transform during the drag, and on drop uses `document.elementFromPoint` to find the nearest ancestor carrying `data-invoice-column` (only Non payées/Payées/Annulées carry it — En retard and Devis don't, so a drop there just snaps back). The directive never owns the actual status; `InvoiceBoardPage` does, reconciling against the backend response same as every other write in this app.

---

# Phase 17 — Quarterly Reports & Activity Analytics

## Objective

Turn the invoice history FactureLe already holds into two things an artisan actually needs but currently has to reconstruct by hand: a **quarterly report** shaped for their URSSAF/tax declaration (the reality for a French *auto-entrepreneur*, who must declare turnover every quarter or month), and an **activity dashboard** — the "business insights" goal named in this roadmap's own Product Vision from day one, not yet built.

## Why cash-basis, not invoicing date

URSSAF/tax declarations for a micro-entrepreneur are based on *encaissements* — money actually received — not on when an invoice was issued. An invoice created in March but paid in April counts toward Q2, not Q1. This is exactly why this phase depends on Phase 16: without a real `PAYEE` status and `paidAt` date, there would be no reliable way to know when money actually came in, only when it was invoiced — and building the report on invoicing date instead would hand the artisan a number that's simply wrong for what they're required to declare. Every figure in this phase is computed off `paidAt`, never `createdAt`/invoice date.

## Data Model

- `Company.declarationFrequency` (`MENSUELLE | TRIMESTRIELLE`, default `TRIMESTRIELLE`) — which period the report screen defaults to; a real choice auto-entrepreneurs make at registration.
- `Company.microEntrepreneurCeiling` (optional, integer cents) — an artisan-editable threshold for the plafond warning below, deliberately **not** a hardcoded legal constant: the actual ceiling depends on activity type and changes over time, and baking in a number the app can't guarantee is current would be worse than not showing one. Left blank, the warning simply doesn't appear.
- `Product.activityCategory` / `Service.activityCategory` (optional: `VENTE_MARCHANDISES | PRESTATION_BIC | PRESTATION_BNC`, default unset) — artisan-set, since only they know which URSSAF category their own registration puts each item under. Report totals bucket by this field, with an explicit "non catégorisé" bucket for anything left unset, so nothing is silently mis-bucketed.
- The report itself is **not a stored entity** — computed on demand from `PAYEE` invoices whose `paidAt` falls in the selected period, same "derived data is never persisted" convention as invoice totals, Phase 5's redistribution, and Phase 16's overdue column. Nothing to keep in sync, nothing that can drift from the underlying invoices.

## Features — Quarterly Report

- [x] Report screen: pick a period (quarter or month, per `declarationFrequency`; a custom range too) and see total encaissé for that period
- [x] Totals broken down by `activityCategory`, plus a visible "non catégorisé" bucket when items haven't been tagged
- [x] List of the individual paid invoices that make up the total (client, amount, `paidAt`) — an audit trail the artisan can cross-check against, not just a bare number to trust blindly
- [x] Export the report as PDF (reuses the existing `PdfService` pipeline) and as CSV (for pasting into a spreadsheet or handing to an accountant)
- [x] Optional plafond warning: a progress indicator comparing year-to-date encaissements against `microEntrepreneurCeiling`, shown only when that field is set

## Features — Estimated Charges (added after initial delivery)

Requested by the user after the rest of Phase 17 shipped: an estimate of what's owed on the period's encaissements, not just the categorized turnover itself — genuinely useful even as an estimate. This **reverses** this phase's original "No tax advice, no rate computation" non-goal below for the one case where a reliable estimate is actually possible from data this app already has.

- [x] Micro-entrepreneur cotisations sociales estimate, computed per `activityCategory` off the period's `byCategory` breakdown, using the company's own (editable) cotisation rates
- [x] Optional versement libératoire estimate, added only when the company has opted in (`Company.versementLiberatoireOptIn`)
- [x] Explicit "not applicable" message — never a guessed number — for any `legalStatus` other than `MICRO_ENTREPRENEUR`
- [x] Turnover left in "non catégorisé" is excluded from the estimate and called out explicitly, so the total reads as a floor, not a silently wrong full figure
- [x] Included in the on-screen report, the PDF export, and the CSV export
- [x] Cotisation rates (`Company.cotisationVenteBasisPoints`/`cotisationPrestationBicBasisPoints`/`cotisationPrestationBncBasisPoints`) are pre-filled with the official rates but artisan-editable in "Mon entreprise" — same reasoning as `microEntrepreneurCeiling`: real rates are revised periodically and a Cipav-affiliated profession pays a different rate than the general regime, and this app can't guarantee a baked-in number stays current

## Features — Activity Analytics

- [x] Revenue-over-time chart (encaissé, by month, last 12 months)
- [x] Top clients by revenue, top products/services by revenue and by frequency
- [x] Outstanding total: sum of `NON_PAYEE` + `En retard` invoices (Phase 16), so the artisan sees "billed but not yet collected" alongside what's actually been received
- [x] Basic activity counters: invoice count, average invoice value, count of active clients/products
- [x] Hosted in "Mon activité" (Phase 9's existing "Atelier sobre" section, company settings) — the sanctioned spot where the app already speaks about the artisan's business rather than asking for fast data entry, extended rather than duplicated with a new screen

## Non-goals

- **No e-filing / URSSAF API integration.** The artisan still enters the figure on the official portal themselves; this phase produces the correct number and a paper trail, not a submission.
- **No *guessed* tax advice.** ~~No rate computation~~ — revised after initial delivery (see "Features — Estimated Charges" above): the app *does* now compute an estimate of cotisations sociales/versement libératoire for a micro-entrepreneur, since that computation is fully determined by data the app already has (categorized turnover x the company's own rates). What's still firmly out of scope is anything that would require *guessing* — ACRE/exemptions, a mid-period regime change, or any figure for a `COMPANY` (whose real IS/IR depends on deductible expenses this app doesn't track). Matches the same honesty principle already applied to Phase 10 (sourcing) and Phase 12 (mail delivery): the app computes what it can fully verify from its own data, and says plainly when it can't, rather than approximating past that line.
- **No expense/charge tracking.** FactureLe only knows the revenue side (invoices); a full accounting picture (deductible expenses, etc.) is a materially different feature and out of scope here.
- **No automatic activity-category detection.** Guessing VENTE vs. PRESTATION from a product/service name risks being confidently wrong on exactly the field that determines a real declaration — left to explicit artisan input instead.

## Notes

- Depends on Phase 16 for `paidAt`/status — sequenced after it for that reason, not just numbering convenience.
- Cross-reference: this roadmap's own Product Vision has named "business insights" as a long-term goal since the very first draft; this phase is the first concrete delivery of that promise.

## Decided during implementation

- **No premium gate, decided explicitly with the user** — unlike `PremiumGateService.assertCanCreateInvoice`, both the quarterly report and Activity Analytics are reachable regardless of subscription status. An artisan must always be able to produce their own turnover declaration; only invoice creation past the free trial is ever gated.
- **`activityCategory` is snapshotted onto `InvoiceLine`/`InvoiceServiceLine` at creation time, never a live join through `Product`/`Service`.** `InvoiceLine` already has no live FK to `Product` at all (only the freehand `productCode` — see Phase 8.5/11), so a snapshot is the only option for product lines; for service lines (which do have a soft `serviceId` FK) the same snapshot rule was chosen deliberately rather than reading `Service.activityCategory` live at report time: retroactively recategorizing a catalog item must never silently change a quarterly report for a period that may already have been declared to URSSAF. The frontend carries this the same "autofill, not a lock" way as `productCode`/`catalogProductId` — copied in from the picked catalog `Product`/`Service` at add-time (`InvoiceCreateLinesStepPage.addProductFromCatalog`/`addServiceFromCatalog`), never its own visible form field.
- **Every figure is HT (excl. VAT), including Activity Analytics** — not just the legally-required Quarterly Report. URSSAF's own "chiffre d'affaires encaissé" is HT (VAT collected isn't the artisan's own turnover), and using one convention everywhere avoids a second basis to reason about. The Quarterly Report's per-invoice audit-trail list is the one deliberate exception: each row shows that invoice's TTC total, since that's the amount that actually landed in the artisan's bank account and is what the artisan will cross-check the report against.
- **`REDISTRIBUTED` service-line amounts are never bucketed separately** — `InvoiceCalculationService` already folds them into the receiving product lines' own totals (Phase 5), so summing by each line's own `activityCategory` captures that value exactly once, with no separate handling needed.
- **A `MANUAL` invoice has no per-line categorization at all** — its whole subtotal lands in the "non catégorisé" bucket rather than being silently dropped, matching the "no automatic activity-category detection" non-goal (manual mode has no fixed column roles to hang a category off of).
- **"Rapports" is a new top-level nav entry**, not tucked into the "Mon répertoire" dropdown or reachable only from company settings — decided explicitly with the user as important enough to be one click away.
- **The revenue-over-time chart is a hand-rolled SVG component (`RevenueBarChartComponent`)**, no charting library added — same "small owned UI primitives over a dependency" precedent as the Phase 8 tour engine and Phase 9's motion primitives.
- **`CompanyRepository.update` was rewritten to build its Prisma `data` object explicitly** (matching `ProductRepository`/`ServiceCatalogRepository`'s existing convention) instead of passing the DTO straight through — needed so a blanked `microEntrepreneurCeilingEuros` field on the settings form actually clears the ceiling (and stops the plafond warning from showing) instead of a `PATCH` silently leaving the old value in place.
- **Top clients/products/services and the activity counters are all scoped to the same rolling 12-month PAYEE window as the revenue chart** — one "what does activity mean here" answer for the whole dashboard. `outstandingTotalCents` is the deliberate exception (an unpaid invoice has no `paidAt` to scope by), always the company's entire unpaid book.
- **Cotisation rates are editable, versement libératoire rates are not.** Confirmed explicitly with the user: the three cotisation-sociales rates (`Company.cotisationVenteBasisPoints` and friends) are pre-filled defaults the artisan can correct — they're revised periodically and a Cipav-affiliated liberal profession pays a different rate than the general regime, the same volatility that already justified making `microEntrepreneurCeiling` editable rather than hardcoded. The versement libératoire rates (1% / 1.7% / 2.2%) are plain constants (`VERSEMENT_LIBERATOIRE_RATE_BASIS_POINTS` in `activity-category.util.ts`) instead: they're fixed nationally by law with no per-profession variation, so there's nothing for an artisan to correct.
- **The estimate is scoped to `legalStatus MICRO_ENTREPRENEUR` only, with an honest message otherwise — never a number for a `COMPANY`.** A société's real IS/IR is a function of deductible expenses (Phase 17's own pre-existing "No expense/charge tracking" non-goal), which this app has no way to know; showing *any* figure there would look authoritative while being unfounded. This is the load-bearing reason the original "no rate computation" non-goal could be narrowed rather than dropped outright — the computation that got added is the one case where full-precision data actually exists.
- **Uncategorized turnover is excluded from the estimate, not zero-rated or averaged in.** Applying a rate to turnover the artisan never assigned a category to would silently misstate the estimate in either direction; excluding it and surfacing the excluded amount (`uncategorizedExclVatCents`) keeps the shown total an honest floor instead.
- **The estimate is duplicated three times (JSON report, PDF, CSV) rather than computed once and referenced** — same shape as every other report figure in this phase (`byCategory`, `plafondWarning`): `ReportsService.getQuarterlyReport` computes it once per request, and the controller reshapes that same result for each output format, so the three can never disagree with each other for the same period.

---

# Phase 17.5 — Resend as the System SMTP Relay

## Objective

Wire up an actual SMTP relay for Phase 13's `SYSTEM_SMTP_*` env vars (account verification, password reset), which had been unconfigured — those routes replied 503 up to now. Chose [Resend](https://resend.com) over a raw mailbox (Gmail app-password, etc.): reliable deliverability out of the box, a free tier that comfortably covers this app's transactional volume, and no code changes needed since `AuthService`/`MailerService` already speak plain SMTP.

## Implementation notes

- [x] `SYSTEM_SMTP_HOST=smtp.resend.com`, `SYSTEM_SMTP_PORT=465`, `SYSTEM_SMTP_SECURE=true`, `SYSTEM_SMTP_USER=resend` — Resend's SMTP relay always authenticates with the literal username `resend`; the password slot is a Resend API key, not a mailbox password.
- [x] `SYSTEM_MAIL_FROM_ADDRESS=onboarding@resend.dev` for now — Resend's shared sender, usable immediately with no domain verification. **Revisit once a real domain is verified in the Resend dashboard**: switch this to an address on that domain so verification/reset emails don't arrive from a resend.dev address.
- No application code changed — this phase is purely `backend/.env` configuration plus documenting the Resend option in `.env.example` for future deploys/environments.

---

# Phase 18 — Guided Tour Rework: A Real Quick-Mode Walkthrough

## Objective

Turn `invoice-creation` (mode rapide's mini-tour, Phase 8) from a fixed script into something that actually reacts to what the artisan does and what's already in their account — while leaving `invoice-creation-manual` (Phase 9.5) untouched, since mode manuel's tour was already considered right.

## Features

- [x] If the artisan has no client yet, the tour walks them through creating one step-by-step and explains it'll be reusable on every future invoice — instead of always spotlighting a client grid that might be empty.
- [x] "Ajouter un produit" and "ajouter une prestation" are one logical tour step: it reacts to whichever of the two buttons is actually clicked, and branches into a different explanation depending on which one it was.
- [x] Whether the artisan creates their first product or picks one already in the catalog, the tour reacts the same way afterward: it asks for the chantier's real quantity/metrage.
- [x] The tour explains that a validated line is a card you can reopen, and that "Mettre à jour" there is optional — it only touches the catalog if you want it to.
- [x] A dedicated step for prestations explains the FIXED vs. PERCENTAGE margin choice (Phase 13.5): whichever you pick, the calculation is automatic and identical for every client, no favoritism.
- [x] The tour's last spotlighted step now points at "Mes documents" in the nav, tying the whole walkthrough back to where the invoice/devis actually lives once saved.

## Implementation notes

- **The engine gained just enough branching to stay declarative.** `TourStepDefinition` (`tour-definitions.ts`) can now carry: `id` (a stable jump target), `altAnchorIds` (other anchors that also advance the same logical step), `showIf` (a symbolic runtime condition — currently only `noCustomers`/`hasCustomers` — that skips a step exactly like a missing anchor already did), `next` (an unconditional jump to another step's `id`), and `nextByAnchor` (the same jump, but keyed by which anchor actually fired). `TourService` is still the only thing that *resolves* these — `tour-definitions.ts` stays pure data, same rule Phase 8 set.
- **`TourOverlayComponent.next()` now takes the anchor id that fired**, so a step offering two ways forward (the product/service "add-line" step) can tell `TourService.resolveNextIndex` which branch to take; the plain "Suivant" button still calls `next()` with no argument and falls back to the step's `next`/plain index.
- **`showIf` was first evaluated by reading `CustomerService.all()` directly**, on the assumption that `InvoiceDraftStore`'s own load would always have populated it by the time the quick-mode tour reached the customer step — true there, but not on `/clients`/`/produits`/`/prestations` (see Phase 19), which load their own local, unfiltered-cache-bypassing list instead. Revised in Phase 19 to always call the relevant service's `getAllCached()` (awaited) instead of reading a signal that might still be `null`.
- **New anchors**: `invoice-new-customer-button` ("+ Nouveau client"), `invoice-line-quantity` (deliberately the *same* id on both the full line-form's quantity field and the collapsed gallery card's mini quantity input — whichever one is actually on screen for a given line is the one the registry finds, so one tour step covers the free-line and catalog-pick paths without branching), `invoice-lines-gallery` (the card grid itself, always mounted regardless of collapsed/expanded state — sidesteps waiting on a card that may not exist yet), `invoice-service-flyout` (the prestations panel), and `nav-my-documents` (the persistent nav link, registered from `App`'s own template since it outlives every routed page).
- **Product and service paths converge before "Le total, en direct"** via explicit `next: 'total'` on each path's last step — the array still lists the product block before the service block, so only the step that would otherwise fall through into the other branch needs the override.
- Mirrors the messaging work in `docs/positioning.md` and the landing page (Phase 13.3): reuse compounds (client/catalog once, invoiced forever) and the invoice lifecycle doesn't end at "PDF sent" (Phase 16's board is where relances and unpaid tracking actually happen) are both now said once in the tour and once on the public site, instead of only living in the app itself.

---

# Phase 19 — Two Tour "Modes": First-Time Creation vs. Guided Reminder

## Objective

Give `catalog` and `customers` (Phase 8) the same reactive treatment Phase 18 gave `invoice-creation`, and make the split explicit app-wide: every tour now has a "mode 1ère fois" detour — reached only while the relevant table (clients/produits/prestations) is genuinely empty for this artisan — that walks them through creating their very first entry and celebrates once it's *actually* persisted, distinct from the unconditional "mode guide" content a returning artisan sees on replay. Also closes a real gap Phase 18 left open: the quick-invoice tour never actually reached the moment a document gets saved, so it could never honestly celebrate a first client/product/prestation — Customer/Product/Service rows from that flow aren't persisted until the final "Créer la facture" submit (see `InvoiceCreatePreviewStepPage.submit()`), not when their forms are merely filled in.

## Features

- [x] `catalog` and `customers` each gained a "create your first X" detour, shown only when that list is empty, reusing the existing "+ Nouveau X" anchors rather than adding new ones.
- [x] A real, persisted save — not just filling the form — is what triggers the congratulations step; cancelling or navigating away without saving falls back to the ordinary reminder content instead of a false "premier X enregistré".
- [x] `invoice-creation` now actually reaches the real "Créer la facture"/"Créer le devis" submit and its post-save success block, and celebrates there — the one moment its client/product/prestation congratulations can honestly refer to.
- [x] "Mode rapide" now visually reads as the recommended choice on the mode-choice screen (a "Recommandé" badge, a heavier accent border) — previously the two cards were identical.
- [x] `docs/design-system.md`'s one documented "reward" moment (the tour-completion checkmark+glow) is now reusable mid-tour via `celebrate: true`, instead of only ever firing on a tour's literal last step — kept to a single visual treatment on purpose, so this still reads as "the same one moment," just earned at more places, not a second competing effect.

## Implementation notes

- **`showIf` became async.** `TourStepCondition` grew `noProducts`/`hasProducts`/`noServices`/`hasServices` alongside the existing customer pair; `TourService.evaluateShowIf` now `await`s `firstValueFrom(xService.getAllCached())` instead of reading a signal synchronously (see the corrected Phase 18 note above). Safe to call from `TourService` on demand — unlike `OnboardingService`'s eager constructor-time load (Phase 14.7's bug #1), a showIf-gated step is only ever reached while the tour is already active on an auth-gated route. A failed fetch resolves every condition to `false`, so both alternatives for that moment get skipped rather than risk showing the wrong one.
- **The list pages (`customer-list`, `product-list`, `service-list`) don't call `getAllCached()` themselves** — each loads its own search-filtered view directly into a local signal, bypassing the shared cache Phase 8/Customer-Service already had. `getAllCached()` from `TourService` is therefore a genuine lazy-load the first time a showIf step needs it — but `Product/Service/CustomerService.create()`'s existing `upsertInCache` (unchanged) is what makes the *return trip* free: by the time the tour re-checks `hasProducts` back on `/produits`, the cache the form's own save already updated is read straight off, no second request.
- **"+ Nouveau produit"/"+ Nouvelle prestation"/"+ Nouveau client" are real `routerLink`s to a separate create page** (`/produits/nouveau`, `/prestations/nouvelle`, `/clients/nouveau`), not an inline form — so, same rule as Phase 18's customer-picker step, their cta steps carry no `advanceOn`; the real navigation they cause is what the tour's existing forward-route-matching picks up (`findForwardStepIndexForRoute`), landing directly on a new informational step declaring that route (`produit-form-hint` etc.) and skipping the reminder content in between.
- **Detour steps are reachable ONLY via that forward-route-match, never via plain "Suivant" fallthrough.** Each reminder step positioned between a cta and its own detour carries an explicit `next` override (e.g. `produit-new-reminder`'s `next: 'prestation-cta'`) so a returning artisan clicking through the ordinary reminder content on "Suivant" never gets silently redirected into someone else's create-page. Without this, array-adjacency alone would send a casual "Suivant" click straight into `/produits/nouveau`.
- **Known, accepted gap**: if an artisan who already has products replays the tour and clicks the *reminder* (not the gated cta) "+ Nouveau produit" to create an *additional* one, the celebration still reads "premier produit" — `hasProducts` can't distinguish "always had some" from "just went from zero to one" without tracking prior state. Low-stakes and rare enough (requires a manual replay *and* creating another entry mid-replay) not to be worth the extra bookkeeping.
- **`invoice-creation`'s tail was also fixed, not just extended**: the old `'preview'` step had `advanceOn: 'click'` on a button that *also* causes real navigation (to `/apercu`) — the same double-navigation hazard Phase 18's own doc note warns against elsewhere, just missed here since `/apercu` had no step of its own yet to reveal it (the tour simply flashed forward and got quietly abandoned on the following `NavigationEnd`). Fixed by removing `advanceOn` from `'preview'` and giving the new `'submit-cta'` step the `/apercu` route instead, so the real navigation is what carries the tour there, same rule as everywhere else. `'submit-cta'` itself DOES use `advanceOn: 'click'` — correctly, this time: `InvoiceCreatePreviewStepPage.submit()` causes no navigation of its own (success just flips `createdInvoice()` on the same route), so clicking only needs to move the tour's attention to `'created'`, whose own anchor-wait (already-existing `waitForAnchor` polling, ~2s) is what actually holds the reveal open until the real save resolves.
- **The final celebration step's copy is deliberately doc-type-agnostic** ("votre document", not "votre facture"/"votre devis") rather than reading `InvoiceDraftStore.documentType()` from `TourService` — the real page heading right next to the spotlighted success block already says "Devis" or "Facture" explicitly, and reading a feature-level store from `shared/tour/` would be the first real `shared` → `features` dependency in the tour engine.

---

# Phase 20 — Site-wide Footer: Mentions Légales, RGPD & Compliance Audit

## Objective

Add a persistent, "classic" footer across the whole app — today a footer only exists on the public landing page (`landing.page.html`), not in the authenticated app shell (`app.html` has none) — carrying the standard legal surface (mentions légales, politique de confidentialité, CGU, contact), and audit that the app's actual behavior matches what those pages themselves claim.

## Current State (found before starting)

- `/cgu` and `/confidentialite` already exist (`features/legal/`) and are already linked from the signup consent checkbox (Phase 13) — this phase reuses them, it doesn't rebuild them.
- No "mentions légales" page exists yet — this is new.
- "Mentions légales" is about **FactureLe's own identity as the SaaS publisher/operator** (publisher name, SIRET, address, hosting provider, director of publication) — not an artisan's own `Company` row (`backend/prisma/schema.prisma`), which is per-tenant data used only for that artisan's own invoices and isn't reusable here.

## Data Model

- A small, static set of facts about FactureLe's own legal identity (publisher name, SIRET, address, hosting provider, director of publication, contact email). This does not belong on `Company` (per-tenant). Decide at implementation time whether it's a typed config constant or a `SITE_LEGAL_*` env-var set — whichever keeps it editable in exactly one place, without a migration or hunting across pages for hardcoded copies.

## Features

- [x] Shared `FooterComponent`, mounted once in the app shell (`app.html`) and reused by the landing page instead of its own separate footer markup
- [x] New "Mentions légales" page/route (publisher identity, hosting provider, editor)
- [x] Footer links: Mentions légales, CGU (existing `/cgu`), Politique de confidentialité (existing `/confidentialite`), contact
- [x] Compliance audit: read `/confidentialite`'s actual claims (data retention, right-to-erasure, cookies, named third-party processors) and cross-check each one against what the code actually does — including every external processor the app already uses (Groq, Stripe, Resend, Google OAuth) is genuinely disclosed there
- [x] Any gap the audit finds gets fixed, or explicitly logged as a known limitation (same "state it, don't silently build around it" convention as Phase 13's retention-vs-erasure note)
- [x] FactureLe's own legal identity (name/SIRET/address/etc.) lives in exactly one place in code — editable without touching every page that cites it

## Non-goals

- No change to per-artisan `Company` legal fields or invoice content — this is FactureLe's own footer as a SaaS publisher, not the documents artisans generate for their own clients.
- No cookie-consent banner unless the audit finds the app actually sets non-essential cookies requiring one (today: httpOnly auth cookies only — confirm during the audit rather than assuming either way).

## Notes

- Builds on Phase 13.3 (landing page footer/visual identity) and Phase 13 (CGU/confidentialité pages, RGPD deletion flow) — this phase's audit checks the app against mechanisms those phases already built.

## Decided with the user before implementation

- **The legal identity data is DB-backed and admin-editable, not a static config/env-var set.** The roadmap draft above left this open; decided explicitly before building: a new `SiteLegalInfo` singleton table, edited from a new `/admin/infos-legales` page, so the publisher name/SIRET/address/hosting provider/director-of-publication/contact email can change without a deploy — consistent with the rest of the admin dashboard (users, promo codes) being the place an admin manages cross-tenant, non-per-company data.
- **The compliance audit is a one-time, documented pass, not a persistent admin view.** No new UI lists "declared processors and their status" — the audit's findings are fixed directly in `/confidentialite`'s copy and recorded below; revisit only if a future phase specifically wants ongoing compliance monitoring.

## Implementation notes

- **`SiteLegalInfo` is a single fixed-id row (`id: "singleton"`), not a real per-admin or per-deployment table.** `SiteLegalRepository` always reads/upserts `where: { id: SITE_LEGAL_INFO_ID }` — same "one row, fixed id" shape as a settings table, simpler than a `findFirst`-based singleton convention. Every field defaults to `""` on a fresh deploy: nothing is seeded with placeholder text, since fabricating a SIRET or address would be actively wrong. The admin "Infos légales" page must be filled in with real values before launch — `/mentions-legales` shows an explicit "not yet configured" notice instead of blank/fake fields until then.
- **`GET /site-legal` is `@Public()` and shared by three readers**, rather than a separate admin-only read endpoint: the public `/mentions-legales` page, `FooterComponent`'s contact-email link, and the admin edit form's own prefill. Mentions légales are public information by law regardless of who's reading them, so there's no real read-side access control to add — only the `PATCH /admin/site-legal` write (folded into the existing `AdminController`, `@Roles(ADMIN)` already covers it at the class level) needed a guard.
- **The footer is deliberately styled with the app's normal neutral tokens ("Chantier calibré"), not "Atelier sobre"**, even though it replaces the landing page's own footer. `docs/design-system.md` scopes "Atelier sobre" to four sanctioned, *light-only* spots (PDF header, tour, "Mon activité", landing hero) — a footer now mounted in `app.html` also renders inside the authenticated app shell in dark mode, which "Atelier sobre" was never built to support. `landing.page.html`'s own `<footer>` block (and the now-unused `currentYear` field on `LandingPage`) were removed in favor of the shared one.
- **Compliance audit findings, fixed directly in `/confidentialite`:** the page was previously silent about every third-party processor (Stripe, Resend, Groq, Google OAuth, an artisan's own SMTP relay), said nothing about cookies, and didn't mention the 10-year invoice-retention-vs-RGPD-erasure tension already known from Phase 13. All four are now stated plainly — processors named with what they receive and when (e.g. Groq only sees a product name/quantity/customer city, only when the artisan explicitly clicks "Trouver des fournisseurs"), cookies confirmed as strictly-necessary-only (no consent banner needed, confirming this phase's non-goal), and the retention/erasure gap disclosed as a real limitation of self-service account deletion today (it deletes invoices too — an artisan under an active legal retention obligation needs to keep their own copy first) rather than silently building a partial fix into this phase.
- **CGU's own placeholder text was left untouched** — the roadmap scoped the audit to `/confidentialite`'s claims specifically (data retention, erasure, cookies, processors); CGU makes no claims that the app's actual behavior could contradict.

---

# Phase 21 — TLS/Caddy Hardening & Certificate Monitoring

## Objective

Not a new certbot container. HTTPS is already fully automated by the existing `caddy` service in `infra/docker-compose.prod.yml` — Let's Encrypt issuance, renewal, and an HSTS header are already built into `infra/Caddyfile`, driven by `{$DOMAIN}` in `infra/.env`. This phase audits and hardens that existing setup, and adds visibility into certificate health, instead of duplicating what Caddy already does.

## Why not certbot

A separate certbot container would either fight Caddy for the port 80/443 ACME challenge or sit unused entirely — redundant either way, since `infra/docker-compose.prod.yml` already documents Caddy as "the single place that owns public exposure/TLS." Flagged and decided explicitly with the user during roadmap planning, before this phase was drafted.

## Features

- [x] Audit `infra/Caddyfile`'s security headers against current best practice (HSTS already present — confirm CSP/X-Frame-Options/etc. are deliberate omissions, not oversights)
- [x] Verify certificate renewal actually works end-to-end in the deployed environment, not just "Caddy claims to auto-renew" — a documented manual check or a scheduled probe
- [x] Certificate-expiry monitoring/alerting, so a renewal failure surfaces before the cert actually lapses, not silently
- [x] Document the TLS setup (`infra/` or deploy docs) so "why isn't there a certbot container" doesn't get re-asked or accidentally re-built later
- [x] Confirm the existing `:80`-no-domain local/smoke-test fallback (`Caddyfile`) can't accidentally ship to prod without a real `DOMAIN` set

## Non-goals

- No certbot or any new TLS-terminating service — Caddy stays the single owner of public exposure and certificates.

## Notes

- Pure ops hardening, no product-facing surface change — sequenced independently of Phases 20 and 22.

## Decided with the user before implementation

- **No live VPS/domain exists yet** — everything here (headers, the monitoring script, the deploy guard) had to be built and verified without a real deployed environment to test end-to-end renewal against. "Verify certificate renewal actually works end-to-end" is therefore a documented manual procedure + a probe script ready to cron once a real domain exists, not something actually exercised against a live Let's Encrypt cert in this phase — stated plainly rather than claimed as done.
- **Cert-expiry alert channel: email via the existing Resend account**, not a new external monitoring service or a Slack/Discord webhook — reuses Phase 17.5's already-configured `SYSTEM_SMTP_*` credentials (the password slot is a Resend API key, directly usable against Resend's HTTP API) rather than provisioning a new secret or a new third-party dependency.

## Implementation notes

- **The CSP is hand-fitted to what the frontend actually loads, not a generic template** — confirmed by reading the code, not assumed: no CDN scripts (fonts self-hosted since Phase 9), Stripe checkout and Google OAuth are both full-page redirects (`window.location.href` / `<a href>`, never an embedded SDK/iframe — `subscribe.page.ts`, `auth.service.ts#googleLoginUrl`), and the invoice PDF preview renders into an `<iframe [src]>` pointed at a client-generated `blob:` URL (`pdf-preview-modal.component.html`). That let `script-src` go fully strict (`'self'` only, no `unsafe-inline`/`unsafe-eval`) while `style-src` keeps `'unsafe-inline'` — the tour overlay's spotlight positioning, `interactjs`-driven column/row resize (mode manuel), and the line-marking badge all set inline `style.*` via JS at runtime, a legitimate first-party pattern this app relies on across three separate phases (8, 9, 9.5) that a stricter `style-src` would have broken. `frame-src 'self' blob:` covers exactly the PDF preview iframe and nothing else; `frame-ancestors 'none'` + `X-Frame-Options: DENY` since the app is never meant to be embedded; a `Permissions-Policy` disables browser features (camera/mic/geolocation/payment/usb) the app never uses. Full reasoning lives inline in `infra/Caddyfile`'s own comments, next to the header block itself, so it can't drift out of sync with a future edit.
- **The CSP was verified against a real headless-browser run of the built prod image, not just reasoned about** — Playwright driving the actual `make prod`-equivalent stack (`docker compose -f infra/docker-compose.prod.yml`, `DOMAIN=:80`), listening for the browser's own `securitypolicyviolation` event (the authoritative signal, not a console-text grep) across the real user journey: landing page, signup, company onboarding, the invoice-creation tour overlay, mode manuel's resize canvas, and the PDF preview's blob iframe. This caught a genuine, otherwise-silent break: Angular's production build (`beasties`) by default rewrites the main stylesheet `<link>` into `media="print" onload="this.media='all'"` to defer non-critical CSS — an inline event-handler attribute `script-src 'self'` blocks outright, which would have shipped the entire app unstyled on first load. Fixed by setting `optimization.styles.inlineCritical: false` in `frontend/angular.json`'s production config (`build.configurations.production.optimization.styles`) — don't re-enable it without re-verifying against this CSP first.
- **`infra/check-cert-expiry.sh`** reads `infra/.env` directly (same `DOMAIN` Caddy itself uses — no duplicated config) rather than taking parameters, checks the live certificate via `openssl s_client`/`x509 -enddate`, and alerts by POSTing to Resend's HTTP API with `curl` when fewer than `CERT_EXPIRY_WARN_DAYS` (default 14) remain or no certificate could be retrieved at all. It's a standalone script meant for the VPS's own crontab, not a container — a one-off ops probe has no reason to be part of the app's deploy surface. Skips cleanly (exit 0) when `DOMAIN` is unset/`:80`, so it's harmless to leave configured on a machine only ever used for local smoke-testing.
- **`infra/deploy.sh` now refuses to run if `infra/.env`'s `DOMAIN` is empty or still `:80`** — the local/smoke-test fallback value. Only guards `deploy.sh` (redeploys), not `make prod` directly, since `make prod` is also the documented way to smoke-test a prod build locally and must keep working with `DOMAIN=:80`; a real VPS only ever ships through `deploy.sh`.
- **No HSTS `preload`.** Adding it means submitting the domain to the browser-hardcoded HSTS preload list — a one-way decision that's slow and painful to reverse (browsers ship the list, removal can take months to propagate). Left as a documented option for later, not added blind against a domain that doesn't exist yet.
- **No `upgrade-insecure-requests` in the CSP** — it would force every subresource request to `https:` even when Caddy is serving the local `:80` smoke-test fallback (no TLS listener there at all), breaking `make prod` locally. HSTS already covers the real-domain case once a certificate exists.
- **`Via: 1.1 Caddy` (Caddy's own reverse-proxy header) was left as-is** — only the `Server` header was stripped (`-Server` in the `header` block). Removing `Via` too would be a marginal fingerprinting reduction not called for by the roadmap's audit scope, and touches Caddy's own proxy behavior rather than a response header choice.

---

# Phase 22 — Mobile App Mode (iOS/Android via Capacitor)

## Objective

Wrap the existing Angular app with Capacitor to ship installable iOS/Android apps, and verify the UX genuinely holds up on a real mobile form factor — not just a responsive web view. Particular attention: "Mes documents" (Phase 16's 5-column Kanban board — Devis / Non payées / En retard / Payées / Annulées, confirmed in `invoice-board.page.html`) is a wide, drag-and-drop, multi-column layout that risks becoming unreadable squeezed onto a phone screen.

## Current State

No Capacitor/Cordova/Ionic dependency exists in the repo today — clean addition, not a rework of an existing mobile setup.

**Product goal, confirmed explicitly with the user**: presence on both the App Store and Play Store is a stated objective, not just "an installable app" — this ruled out a PWA-only approach (no store presence, weaker push/native support on iOS) as the end state, even though a PWA was considered and would have been the cheaper first step.

## Why Capacitor, Not a Separate Native App or a PWA-Only Approach

Weighed against two alternatives before settling on this phase's approach:

- **A fully separate native app (React Native, Flutter, or Swift/Kotlin per platform)** would duplicate the entire existing Angular UI/business logic (invoice calculation, PDF pipeline, the whole invoice-creation flow) in a second codebase — a real maintenance burden with a single-developer team, for an app whose screens are forms/lists/PDF, not the kind of rich native interaction (games, heavy animation) where a WebView genuinely feels worse. Rejected.
- **A PWA (manifest + service worker, no native wrapper)** is the cheapest option and was seriously considered — zero store review, instant deploys, reuses 100% of the existing app. Rejected only because store presence is an explicit product goal here: a PWA has no listing on either store, weaker/less reliable push notifications on iOS, and reads as less legitimate/discoverable to a non-technical artisan audience specifically looking for "the app" in a store.
- **Capacitor** wraps the existing Angular build as-is (`@capacitor/ios`/`@capacitor/android`), gets both store listings, and keeps a single codebase — the right tradeoff for this app's UI complexity and this team's size.

## App Store Billing Constraint (Stripe vs. Apple/Google In-App Purchase)

Phase 14's premium gate is billed through Stripe on the web. This is a real constraint on the iOS build specifically, independent of Capacitor vs. any other wrapper choice — it would apply just as much to a fully native app:

- Apple's guideline 3.1.1 requires digital subscriptions *purchased from within the app* to go through Apple's own In-App Purchase (≈30% commission), **unless** the app follows the "external subscription, used as a business tool" pattern already used by apps like Slack/Basecamp/Dropbox: the app may let an already-subscribed user use the paid features, but must not present a "Subscribe"/"Pay" button or any link that starts a Stripe checkout *from inside the iOS app*. The subscription flow (`/abonnement`, Phase 14) stays a web-only action the artisan completes outside the app (browser, desktop) before or alongside using the iOS app.
- Google Play is materially more permissive here (external billing links are commonly tolerated for this kind of business-tool app), so the constraint is effectively iOS-only, but the safest approach is one consistent behavior on both platforms: never surface the Stripe checkout/paywall CTA inside the native app shell.
- Concretely: `PaywallModalComponent`/the `PremiumRequiredException` (402) handling (Phase 14) needs a mobile-specific variant on iOS — inform the artisan they're past the free trial and must subscribe via the FactureLe website, without a tappable link that opens a payment flow in-app.

## Architecture

- `@capacitor/core` + `@capacitor/ios`/`@capacitor/android` wrapping the existing Angular build — one codebase, not a separate mobile app.
- `capacitor.config.ts` pointed at the built Angular `dist/` output; same backend API.
- Phase 13's httpOnly-cookie JWT auth needs verification under Capacitor's WebView — cross-origin cookie behavior there differs from a normal browser tab; may need Capacitor's native HTTP plugin or adjusted CORS/cookie config to keep the existing cookie model working, rather than falling back to a less secure token store as a shortcut.

## "Mes documents" Board — Mobile UX Problem & Directions

The board's 5 columns + drag-and-drop (`invoice-board.page.html`, `interactjs`-based drag directive, Phase 16) assume a wide desktop layout. Directions to evaluate on real usage, same "not mutually exclusive, whichever proves fastest wins" precedent as Phase 11's picker UX — not pre-decided here:

- Horizontal snap-scroll, one column visible at a time, swipe between them — with the tap-based action buttons (already built for glove/phone use, Phase 16) as the primary interaction over drag, since dragging a card into an off-screen column isn't realistic on a phone anyway.
- Collapse to a single filterable list + a status chip/dropdown instead of columns at all on narrow viewports, reusing the board's existing client/date filter bar.
- Default to a "priorité" view (En retard + Non payées only — already a documented one-tap toggle in Phase 16) as the mobile landing state, with the other columns one tap away, so what needs action first is what's shown first instead of 5 equally-weighted columns.

## Features

- [x] Capacitor wraps the existing Angular build for iOS and Android — one codebase, no separate app to maintain
- [ ] Auth (Phase 13's httpOnly cookies) verified working end-to-end inside the Capacitor WebView on both platforms — the same-origin fix is built and reasoned through (see Implementation notes), but not yet exercised inside a real Xcode/Android Studio run: no Xcode/Android SDK exists in the environment this phase was built in, only a plain-browser verification was possible. Left unchecked deliberately rather than claimed — the first thing to confirm with `make ios`/`make android` on a real Mac.
- [x] "Mes documents" board redesigned for narrow viewports per one of the directions above (or a validated alternative) — never a horizontally-scrolling 5-column desktop layout simply squeezed onto a phone
- [x] Manual pass over every other multi-step/wide screen (invoice creation steps, catalog picker, Phase 17's reports/analytics charts) to catch any other desktop-assumption UI, not just the board
- [x] App icons/splash screens for both platforms generated (store *metadata* — listings, screenshots, descriptions — stays out of scope per this phase's own Non-goals below, not conflated with the icon/splash asset pipeline)
- [x] Push notification capability — not just evaluated, fully implemented (FCM both platforms, a real scheduled "en retard"/"non payée" digest, admin visibility) per an explicit decision with the user to go beyond the roadmap draft's "deferred/stubbed if out of scope" allowance
- [x] Build pipeline for producing installable iOS/Android artifacts documented (`make ios`/`make android`, see docs/deployment.md) — store submission itself stays a separate, later step
- [x] iOS build never exposes a Stripe checkout/payment CTA from inside the app (see billing constraint above) — a mobile-appropriate "subscribe on the website" message replaces `PaywallModalComponent`'s normal in-app link on that platform only

## Non-goals

- No native-only feature beyond what's needed to make the existing web UX work well on mobile (camera/native-storage integration, etc.) unless a later phase asks for it.
- No App Store/Play Store submission process *within this phase itself* — this phase gets the app buildable, compliant, and usable on-device; the actual submission (developer accounts, review, store listings) is the confirmed next step once this phase ships, not an open-ended "someday."

## Notes

- Sequenced after Phase 20 (footer/legal): a mobile app submitted to either store typically needs its own reachable mentions légales/privacy links, so that surface should exist first.
- Builds on Phase 16's board (already designed with tap-first actions for "glove/phone use") and Phase 7's mobile-first, no-hover precedent — this phase is the first time that mobile-readiness gets tested on an actual native shell rather than just a responsive browser viewport.

## Decided with the user before implementation

- **Admin scope**: admin can see which accounts have the mobile app installed (registered push devices — platform, last activity) and send a manual test push. Explicitly *not* app-version/force-update gating — considered and declined.
- **Push notifications: full implementation, not a stub.** FCM wired for both platforms, a real `@nestjs/schedule` daily digest job, admin visibility — see Features above.
- **Board mobile UX**: of the three directions listed above, went with a hybrid — priority view (En retard + Non payées) shown by default below `lg`, other 3 columns one tap away via a "Tout voir" toggle, horizontal navigation between all 5 via CSS scroll-snap. Verified in a real headless-browser pass at a 375px viewport (register → board → toggle → scroll to the last column), not just reasoned about.
- **Prod domain**: none existed yet at implementation time (`infra/.env`'s `DOMAIN` was still `:80`). Will be `https://facturele.net` — hardcoded into `capacitor.config.ts` with a `// TODO` comment (grep-able) rather than left as a placeholder guess, per the user's explicit instruction, in case the domain choice changes before launch.
- **App identifier**: `fr.facturele.app` (iOS bundle id / Android `applicationId`), consistent with the FactureLeBat → FactureLe rename direction already underway elsewhere in the project.
- **Google login hidden on iOS, not Sign in with Apple.** Apple guideline 4.8 requires an app offering third-party sign-in to also offer Sign in with Apple, unless it offers no third-party sign-in at all. Building real Sign in with Apple (a new backend OAuth strategy, Apple JWT verification, a paid Apple Developer Program Services ID/key configured before it's even testable) was weighed against simply not offering Google sign-in inside the iOS app shell — email/password stays available there, Google stays available on web and Android unchanged. Chosen for scope: this closes the same compliance requirement at a fraction of the cost — see the known limitation below for the one real gap it leaves (a Google-only account can't sign into the iOS app at all).

## Implementation notes

- **Cross-origin cookie fix**: `capacitor.config.ts`'s `server.hostname`/`androidScheme`/`iosScheme` point at the real API domain instead of Capacitor's default `capacitor://localhost` — this makes the WebView's own origin equal the API's origin, so the existing `httpOnly`/`sameSite: 'lax'`/`secure` cookies (`backend/src/auth/cookie.util.ts`) keep working completely unchanged; no cookie flag was relaxed. `CAPACITOR_LOCAL_HOST` (read at `cap sync` time, wired into `make ios`/`make android` via `LOCAL_HOST=`) swaps in a LAN IP + plain `http` for simulator testing against a local backend — see the commented-out, dev-only ATS exception in `ios/App/App/Info.plist` and the equivalent Android `network_security_config.xml`, both inert until deliberately uncommented, both flagged to remove before any store submission.
- **FCM for both platforms, never direct APNs.** `@capacitor-community/fcm` makes the iOS app register an FCM token too (Firebase bridges the raw APNs token internally) — `backend/src/push-notification/push-sender.service.ts` therefore only ever needs one vendor SDK (`firebase-admin`) and one credential (`FIREBASE_SERVICE_ACCOUNT_JSON`), not a second direct-APNs key/cert pair for zero functional gain.
- **`ReminderCronService`** (`@nestjs/schedule`, first cron in this codebase) sends one bundled digest push per artisan per day (e.g. "3 factures en retard, 2 non payées"), not one push per invoice — a daily summary, not a real-time alert. Runs in-process in the existing single backend container; would need a distributed lock or a dedicated scheduler only if the backend is ever scaled to multiple replicas, not a concern today.
- **Admin push-device routes folded into `AdminController`**, not a dedicated controller — same convention Phase 20's `site-legal` write route already established (two routes don't warrant fragmenting the admin surface).
- **Native scaffolding turned out lighter than the roadmap draft assumed**: `@capacitor/push-notifications` + `@capacitor-community/fcm` handle `FirebaseApp.configure()` and APNs-token-to-FCM-token bridging entirely on their own (confirmed by reading the installed plugin's own source, not assumed) — no hand-written `AppDelegate.swift`/custom Android `FirebaseMessagingService` subclass was needed. What *is* a genuine one-time manual step, and can't be done from a terminal: adding the Firebase iOS SDK as a Swift Package dependency to the "App" target in Xcode (`CapApp-SPM/Package.swift` is Capacitor-CLI-managed and must not be hand-edited for this), and dropping a real `google-services.json`/`GoogleService-Info.plist` into place once a Firebase project exists.
- **Store-compliance audit** (App Store + Play Store), same "audit now, fix what's fixable in code, document the rest" convention as Phase 20's compliance pass:
  - Generated iOS app icon confirmed alpha-channel-free (`sips -g hasAlpha` → `no`) — Apple's App Store Connect validation rejects icons with transparency, `@capacitor/assets` already flattens correctly, verified rather than assumed.
  - `ITSAppUsesNonExemptEncryption: false` added to `Info.plist` — this app only ever uses standard HTTPS/TLS, so this answers Apple's export-compliance question once instead of on every build upload.
  - A `<meta http-equiv="Content-Security-Policy">` tag was added to `frontend/src/index.html`, mirroring `infra/Caddyfile`'s header CSP: a Capacitor WebView serves its HTML from the local bundle, which never passes through Caddy, so the header-based CSP (Phase 21) silently didn't apply to the native app at all until this. Header-only directives (`frame-ancestors`, `Permissions-Policy`) can't be expressed via a meta tag and stay server-side-only, which is fine since a native app shell isn't embeddable in a browser frame anyway.
  - Apple guideline 4.8 (Sign in with Apple) handled by hiding Google login on iOS rather than building a second OAuth provider — see Decided-with-the-user above. **Known limitation**: an artisan whose only account is a Google-created one (`googleId` set, no `passwordHash`) cannot log into the iOS app at all, since neither Google login nor a usable password exists there — not discovered/fixed in this pass, flagged here for a follow-up (likely a "set a password" flow reachable from the web).
  - Account deletion (RGPD, Phase 13) already lives in `company-settings.page.ts`, reachable from a normal authenticated route, not gated behind billing — already satisfies Apple guideline 5.1.1(v)'s in-app account deletion requirement without any change.
  - `/mentions-legales`, `/cgu`, `/confidentialite` are already public routes (Phase 20), reachable from a fresh unauthenticated install on either store — confirmed, not assumed.
  - Android: `POST_NOTIFICATIONS` permission (API 33+) and default notification-channel/icon metadata added to `AndroidManifest.xml`; `compileSdk`/`targetSdk` 36 (Capacitor 8's own template default) already satisfies Play's rolling target-API-level policy with no change needed.
  - **Left as operational checklist items, not code** (same split Phase 20 used for its own audit): `SiteLegalInfo` must be filled in with FactureLe's real legal identity before submission (it defaults to empty strings, never fabricated placeholder text); the iOS Privacy Manifest (`PrivacyInfo.xcprivacy`, scaffolded with a baseline `UserDefaults` declaration) needs re-review against whatever exact SDK versions ship; both stores' privacy/data-safety questionnaires need answering (this app collects email, invoicing data, and a push token — used for app functionality only, never shared/sold); an Android release needs a signed `.aab` (Play requires App Bundle, not APK) via `cd frontend/android && ./gradlew bundleRelease` once a signing key exists.
- **`make ios`/`make android`** (Makefile) build the production Angular bundle, `cap sync` (copying it plus every installed plugin into `ios/`/`android/`), then open the native IDE — `LOCAL_HOST=<lan-ip>` routes at a local backend instead of the real domain for simulator/emulator testing. Neither target installs Xcode/Android Studio/the Android SDK themselves, only invokes them.

---

# Phase 22.5 — Rewarded Ads: Bonus Free Invoices on Mobile

## Objective

Give a mobile artisan past their one free invoice (Phase 14's gate) a way to unlock a handful more without subscribing: watch a short batch of rewarded video ads (Google AdMob) to earn one bonus invoice, up to a small lifetime cap per company. Mobile-only (iOS/Android via Capacitor, Phase 22) — the web app's paywall is untouched, still Stripe-or-nothing.

This is not meant to replace the 15€/mois subscription as a viable full-time path (an artisan who invoices regularly still needs to subscribe) — it's a bridge for someone who hit the wall this month and isn't ready to pay yet, and a low-cost way to partially offset server/infra costs from users who would otherwise convert to €0.

## How It Works

1. An artisan on mobile hits the existing paywall (`PaywallModalComponent`, thrown as `PremiumRequiredException` from `PremiumGateService.assertCanCreateInvoice`).
2. If they still have bonus credits available (lifetime cap: **5 per company**) and are on native mobile (not web), the modal offers an alternative to subscribing: **"Regarder des pubs pour débloquer une facture."**
3. Accepting plays a short, fixed-size batch of rewarded video ads back to back (exact count decided at implementation time, in the 3–5 range the user asked for) via AdMob's rewarded video format.
4. Each ad completion is confirmed server-side via **AdMob Server-Side Verification (SSV)** — never trusted from the client alone (a client could otherwise fake "ad watched" callbacks with no ad ever shown). Once the batch is confirmed complete, the backend grants one bonus invoice credit.
5. `PremiumGateService.assertCanCreateInvoice` allows one additional invoice per unspent bonus credit, same "frustrate at the last moment" gate as Phase 14 — nothing about catalog/customer/service screens changes.
6. Once all 5 lifetime credits are spent, the modal only offers the subscribe path — no infinite ad loop.

## Data Model

- `Company.rewardedAdCreditsGranted: Int @default(0)` — how many bonus invoice credits this company has ever earned, capped at 5 by application logic before granting (mirrors `PromoCodeRedemption`'s "cap enforced explicitly, not just assumed" pattern, just without needing a separate join table since there's no per-code identity to track, only a count).
- `PremiumGateService.assertCanCreateInvoice`'s free-trial check changes from the hardcoded `invoiceCount < 1` to `invoiceCount < 1 + rewardedAdCreditsGranted` — `invoiceCount` itself stays derived (never persisted), exactly as today; only the *allowance* becomes variable instead of a constant `1`.
- A small `RewardedAdBatch` (or similar) row per in-progress batch — tracks how many of the required ad views in the *current* batch have been SSV-confirmed for a given company, so a batch can survive the app being backgrounded mid-sequence rather than losing progress. Cleared/consumed once the batch completes and a credit is granted.

## Features

- [ ] AdMob Capacitor plugin integrated (`@capacitor-community/admob` or equivalent), rewarded video ad unit configured for both iOS and Android
- [ ] Paywall (`PaywallModalComponent`) gains a mobile-only "regarder des pubs" alternative path, hidden entirely on web and once the 5-credit lifetime cap is reached
- [ ] Sequential rewarded-ad batch flow: plays the configured number of ads back to back, tracking progress if the app is backgrounded mid-batch
- [ ] Backend AdMob SSV callback endpoint: verifies Google's signature on each reward callback (rotating public keys fetched from Google's published verification-key endpoint, cached), matches the callback's `custom_data` back to a company, and increments that company's in-progress batch
- [ ] Once a batch reaches its required count, one bonus invoice credit is granted (`rewardedAdCreditsGranted += 1`), capped server-side at 5 — the cap is enforced in the granting code path itself, not just hidden client-side once reached
- [ ] `PremiumGateService.assertCanCreateInvoice` updated to the `1 + rewardedAdCreditsGranted` allowance; existing e2e coverage for the free-trial gate extended for the new allowance
- [ ] Admin dashboard (existing users list/detail, Phase 14) shows a company's ad-credit count (e.g. "3/5 utilisés") alongside its existing subscription status — same "admin can see the full billing picture" precedent as `premiumGrantedUntil`
- [ ] iOS: App Tracking Transparency (ATT) prompt wired if personalized ads are used, or AdMob configured for non-personalized-only to skip ATT entirely (decide at implementation time — non-personalized is simpler and avoids an extra permission prompt, at the cost of lower fill/eCPM); `PrivacyInfo.xcprivacy` (scaffolded in Phase 22) updated to declare the AdMob SDK's actual data collection; SKAdNetwork identifiers added to `Info.plist` per Google's published list
- [ ] Android: `AD_ID` permission declared (or explicitly excluded if non-personalized-only) in `AndroidManifest.xml`

## Non-goals

- No ads anywhere on the web app — the existing Stripe-only paywall (`PaywallModalComponent` on web) is unchanged.
- No ads or reward mechanism for companies that already have premium access (active subscription or a live `premiumGrantedUntil` grant) — this only ever applies to a company currently blocked by the free-trial gate.
- Not a replacement for Phase 14's subscription funnel — the modal always still offers "s'abonner" as the primary path; watching ads is the secondary option, and disappears once the lifetime cap is spent.
- No generic display-ad network (banners, interstitials outside this one reward flow) — rewarded video in this one specific spot only.

## Notes

- Depends on Phase 22 (Capacitor mobile shell must exist) and Phase 14 (`PremiumGateService`/`PaywallModalComponent`).
- Extends Phase 22's store-compliance audit rather than starting a new one — the AdMob SDK's data collection needs to be folded into the same `PrivacyInfo.xcprivacy` and both stores' data-safety questionnaires Phase 22 already tracked as pre-submission checklist items.
- The exact ad-count-per-batch (3, 4, or 5) and whether ads are personalized are the two implementation-time decisions left open — both are cheap to change later (a config value and an AdMob dashboard toggle, not a schema change), so not worth blocking this phase's build on.

---

# Phase 28 — Prestataires & Sous-traitance: What You Owe, Not What You're Owed

## Objective

Give the artisan/salon a way to track amounts *owed to* an external prestataire/sous-traitant/freelance guest — a genuinely new ledger, the mirror image of everything FactureLe has built so far. Every existing model (`Invoice`, `Customer`, `Product`, `Service`) answers "what is the company owed" (accounts receivable). This phase answers "what does the company owe" (accounts payable) — a materially different question this app has never had any way to answer.

**Not yet scoped for implementation.** This phase exists to record the problem, the data model shape, and — critically — the open questions that need a real answer *before* a schema migration is written, not to greenlight a build. See Open Questions below.

## Why This Discovery Happened

Surfaced while building `make demo`'s seed data (`backend/prisma/seed-demo.ts`, see also this roadmap entry's own git history): to make the demo catalog realistic, subcontractor costs (an electrician, a mandatory diagnostic, freelance makeup artists for a big event) were modeled as ordinary `Service` catalog entries, priced at exact pass-through cost, reused consistently so their total is visible via "Statistiques > Meilleures prestations" (Phase 17's Activity Analytics).

That trick genuinely works for the narrow case it was built for (one prestataire, one client job, no markup, paid in step with the client) — but it is a **workaround exploiting a revenue-tracking feature to approximate an expense-tracking one**, not a real answer, and it breaks down immediately outside that narrow case:

- **No cross-job aggregation.** The same prestataire working three different client jobs this month produces three unrelated `Service` line strings — nothing sums "how much do I owe Dupont Élec right now," which was the actual question asked.
- **No independent payment lifecycle.** `Invoice.status`/`paidAt` answer "did the client pay me" — there is no field anywhere for "did I pay my prestataire, and when."
- **Conflates two numbers that should be free to differ.** What the client is billed and what the prestataire is owed only look identical because the seed deliberately priced the pass-through line at cost. An artisan who wants to keep a margin on subcontracted work needs these as two separate numbers, not one.
- **No legal-compliance surface.** France's *obligation de vigilance* (Code du travail, art. L8222-1): above 5 000 €/an of sous-traitance with the same provider, the payer must hold a current attestation URSSAF from them, or risk being held jointly liable for that provider's unpaid cotisations. Nothing in the current schema can hold this.
- **Wrong default exposure.** The workaround puts the pass-through amount on the client-facing PDF (it's just an invoice line, after all) — but "what I pay my subcontractor" is not information most artisans want printed on a document handed to their client by default. A real feature needs to make that an explicit, opt-in choice, never an automatic side effect of entering the data.

This is also why "just add a 3rd + button on the invoice line" was considered and rejected: it would keep solving the client-facing half (which the existing Product/Service catalog already does fine) while leaving the actual question — what do I owe, to whom, has it been paid — exactly as unanswerable as today.

## Relationship to Phase 17's Non-Goal

Phase 17 already states, deliberately: *"No expense/charge tracking. FactureLe only knows the revenue side (invoices); a full accounting picture (deductible expenses, etc.) is a materially different feature and out of scope here."* This phase does **not** reverse that decision — see Non-goals below. Tracking "who is owed what and whether it's been paid" is not the same claim as "here is your deductible-expense total for tax purposes," and this phase must not blur that line, the same honesty-first posture Phase 17 already applied to its own Estimated Charges feature (computed only where the app has full-precision data, an honest "not applicable" everywhere else).

## Data Model (draft — not final, see Open Questions)

- New model `Prestataire` — a per-company catalog entry, same tenant-scoping shape as `Customer`: `name`, `companyName?`, `siret?` (14-digit regex, same convention as `Customer.siret`), `email?`, `phone?`, `description?`.
  - `vigilanceAttestationObtainedAt: DateTime?` — nullable, artisan-set, same "the app reminds, it does not certify" posture as every other compliance-adjacent optional field in this app.
- New model `PayableLine` (name TBD — see Open Questions) — one row per amount owed to a `Prestataire` for one piece of work:
  - `prestataireId`, `companyId` (tenant-scoped, `onDelete: Cascade` like everything else hanging off `Company`)
  - `invoiceId?` — **optional** soft cross-reference to the client job this cost relates to, same "autofill, not a lock" spirit as `Invoice.customerId`; never required, since a retainer or an internal cost isn't always tied to one client invoice
  - `label`, `description?`
  - `amountOwedCents: Int` — the source of truth, same "flat integer cents" convention as `InvoiceServiceLine.amountCents`
  - `status: A_PAYER | PAYE`, `paidAt: DateTime?`, `dueDate: DateTime?` (the prestataire's own échéance — independent of the client's)
  - `createdAt`/`updatedAt`
- Explicitly **not** touching `Invoice`, `InvoiceLine`, `InvoiceServiceLine`, or `PdfService` in this phase — no new invoice-line type, no PDF change.

## Features (draft — nothing here is built yet)

- [ ] `prestataire/` backend domain (controller/service/repository/DTOs/entities, per `docs/conventions.md`'s one-domain-one-responsibility shape) — CRUD, tenant-scoped like `Customer`/`Product`/`Service`.
- [ ] "Ce que je dois" screen: a list of `PayableLine` rows, filterable by prestataire/status — A payer / Payé, a much smaller echo of Phase 16's board conventions.
- [ ] "Total dû" per prestataire — sum of unpaid `PayableLine` rows, computed on demand (derived, never persisted, same rule as every invoice total in this app).
- [ ] Optional, read-only link shown on an `Invoice` back to any `PayableLine` referencing it — informational only, never a line rendered on the invoice/devis itself.
- [ ] SIRET field + vigilance-attestation flag + a simple on-screen reminder once cumulative amount owed to one prestataire crosses the 5 000 €/year threshold — a nudge, not an enforced block.

## Non-goals

- **No PDF/document-facing exposure by default.** Nothing built in this phase appears on an `Invoice`/`Devis` sent to a client. A specific, separately-decided "sous-traitance déclarée" mention for a specific legal context (e.g. certain `marchés publics` requiring a formal DC4-style declaration) is a distinct, narrower feature to consider later — not a default consequence of this one.
- **No deductible-expense / IS computation, no reversal of Phase 17's "no expense/charge tracking" non-goal.** This phase tracks who is owed what and whether it's been paid — it does not feed the Quarterly Report, Estimated Charges, or any tax-liability figure. Reversing that boundary is a separate, much bigger decision (see Phase 17's own reasoning about a `COMPANY`'s real IS/IR depending on deductible expenses this app can't fully see) and is not assumed here.
- **No enforcement of the vigilance-attestation legal obligation.** The app can only remind — verifying a real, current attestation URSSAF is outside what FactureLe can certify on its own.
- **No automatic Invoice-to-Payable creation.** A `PayableLine` is always entered explicitly by the artisan; nothing is auto-generated from an invoice/service line, to avoid silently inventing a payable the artisan didn't actually incur.
- **No payment execution.** No transfer, no virement, no payout to the prestataire — same "tracker, not a payment collector" posture as Phase 16's board for the receivable side.

## Open Questions — resolve with the user before writing a migration

- **Naming.** `Prestataire`, `Sous-traitant`, `Fournisseur`, or a more generic `ExternalProvider`/`Payee`? This name propagates through every layer (schema, DTOs, routes, frontend copy) — worth deciding once.
- **Line shape.** Is a single flat `amountOwedCents` per `PayableLine` enough, or does day/hour-rate billing matter here too (mirroring `Product.unit`+quantity, especially now that the demo catalog has HOUR/DAY-rate rental products)?
- **Scope of "done."** Is an on-screen list genuinely sufficient for v1, or does this need its own exportable document (e.g. a simple récépissé for the artisan's own records)?
- **Future cash-flow reporting.** Should this eventually feed a "trésorerie" view (paid invoices − paid payables = net position), or stay a standalone ledger indefinitely? Doesn't need an answer now, but the data model should not accidentally foreclose it.
- **Priority.** Per `docs/development-rules.md`'s own stated order — Reliability > Simplicity > Maintainability > Scalability > Performance > New features — is this needed before the next paying customer, or does it sit in the backlog behind reliability/simplicity work already in flight? A brand-new domain of this size deserves a deliberate slot, not a rushed one bolted onto an unrelated prompt.

## Notes

- `backend/prisma/seed-demo.ts` keeps the pass-through-`Service` workaround for now, explicitly commented as a stand-in for this phase rather than the intended long-term model — see the comment above `sousTraitanceDefs` (Bâti Rénov) and `freelanceRow` (L'Atelier Beauté).
- Independent of Phase 16/17 (doesn't depend on either shipping further work), but should reuse their vocabulary/UX conventions (`A payer`/`Payé` states, "derived totals never persisted") rather than inventing new ones.

---

# Phase 29 — Parrainage (Referral Program)

## Objective

Let any existing artisan invite others via a personal referral link. When someone creates an account through that link and verifies their email, the reward is **asymmetric**, matching how a referral actually creates value for each side:

- **Parrain** (the existing artisan who invited): **1 month of premium offered**, stacking additively like every other grant into `premiumGrantedUntil`.
- **Filleul** (the new artisan): **5 € off their first billing cycle** (15 € → 10 €) — a discount to help convert a brand-new prospect into a paying subscriber, not free days.

Visible in "Mon abonnement", alongside Phase 14's promo code section. Must work from a mobile install, not just the web app.

## Reward Mechanism

Two different existing mechanisms, one per side, deliberately not unified into one:

- **Parrain → `Company.premiumGrantedUntil`.** Same "one mechanism, several ways to reach it" convention that field already follows (Phase 14: Stripe subscription / admin grant / promo code all funnel through `BillingRepository.grantPremiumDays`) — this becomes a fourth way through that same field.
- **Filleul → a Stripe coupon.** A discount on what a subscriber actually pays isn't something `premiumGrantedUntil` can express at all (that field means "premium *without* Stripe," not "cheaper Stripe") — so this side goes through a real Stripe `Coupon` (`amount_off: 500`, `currency: eur`, `duration: once`) instead, applied either directly to an existing live subscription or attached to the filleul's next Checkout Session (see `BillingService.grantReferralDiscount`/`createCheckoutSession`).

No new `PromoCode` row is minted per referral; a `Referral` row is the record of *why* the grant happened, not a redeemable code of its own.

## Data Model

- `Company.referralCode: String @unique` — generated once at company creation (`UserRepository.createWithCompany()`, retry-on-collision loop), same alphabet/shape convention as `generatePromoCode()` (`promo-code-generator.util.ts`).
- `Company.pendingReferralDiscount: Boolean @default(false)` — set when a filleul's reward fires before they have a live Stripe subscription to apply the coupon to (the normal case — a filleul is by definition brand new). Picked up by the next `createCheckoutSession` call, cleared once that checkout's subscription is confirmed by webhook. No monthly/rate-limit field is needed: `Referral.referredCompanyId` being `@@unique` already guarantees this fires at most once per company, ever.
- `Referral` (new model):
  - `id`, `referrerCompanyId` (FK `Company`), `referredCompanyId` (FK `Company`, **`@@unique`** — a company can be referred at most once, immutable after registration)
  - `rewardGrantedAt: DateTime?` — null until the reward actually fires (see anti-abuse below), non-null once both sides are credited
  - `createdAt`
  - `@@index([referrerCompanyId])`

## Anti-Abuse: Reward Gated on Email Verification, Not Registration

A raw email/password registration is trivially fakeable in bulk — granting a reward the instant a referred account is *created* would let someone farm unlimited free parrain-months with throwaway addresses. Instead: `RegisterDto` gains an optional `referralCode`; at registration a `Referral` row is created immediately (`rewardGrantedAt: null`) if the code resolves to a real company, but **both rewards only fire from `AuthService.verifyEmail()`**, right after it sets `emailVerifiedAt` — reusing Phase 13's existing non-blocking verification email as a real (if modest) proof of a live inbox, at zero extra infrastructure cost. A Google-OAuth signup already sets `emailVerifiedAt` immediately (Phase 13), so referral capture for that path is a **known limitation, deferred**: threading `referralCode` through Google's OAuth `state` round-trip is materially more plumbing than the email/password path for a first version — flagged here rather than silently unsupported.

## Features

- [x] `Company.referralCode` generated for every company (backfilled for existing rows via migration), globally unique, uppercase
- [x] `Referral` model + migration
- [x] `POST /auth/register` accepts optional `referralCode`; invalid/unknown codes are silently ignored (never block registration on a bad referral code)
- [x] `GET /referral/validate/:code` — public, cross-tenant lookup (same "small admin-adjacent catalog, not tenant-scoped" shape as `PromoCode`) so the frontend can confirm a code before submit without exposing the referrer's identity
- [x] `GET /referral/me` (authenticated) — own code, shareable link, count of confirmed referrals, total premium days earned as parrain
- [x] `AuthService.verifyEmail()` → `ReferralService.grantRewardForVerifiedEmail()` grants the parrain 30 days via `BillingRepository.grantPremiumDays` and the filleul a Stripe discount via `BillingService.grantReferralDiscount`, sets `Referral.rewardGrantedAt`, exactly once (guarded by the already-non-null check, same idempotency shape as the rest of `verifyEmail`)
- [x] `BillingService.grantReferralDiscount`: applies the coupon directly (`StripeClientService.applyCouponToSubscription`) if the filleul already has a live (`ACTIVE`/`PAST_DUE`) subscription, otherwise sets `pendingReferralDiscount` for `createCheckoutSession` to pick up on their next checkout; a no-op entirely if Stripe isn't configured on this deployment
- [x] "Mon abonnement" (`subscribe.page.html`) gains a third section, sibling to "Code promo": referral link + copy-to-clipboard button + confirmed-referral count + total parrain-days earned, with the asymmetric reward spelled out in plain language. Gated behind `!platformService.isIosApp()`, same as the existing "Code promo" section (Apple 3.1.1 caution — a section whose entire purpose is describing how to earn premium access/a discount outside IAP)
- [x] `/inscription?ref=CODE` prefills (but never locks — "autofill, not a lock", same as every other prefill in this app) a referral-code field, validated live (debounced) against `GET /referral/validate/:code`
- [x] **Mobile — warm deep link**: tapping a referral link with the app already installed opens straight into `/inscription` with the code carried through. iOS Associated Domains entitlement (`App.entitlements`) + `apple-app-site-association`, Android App Links intent filter (`AndroidManifest.xml`, `autoVerify`) + `assetlinks.json`, both served under `/.well-known/` (new nginx `location` blocks forcing `application/json`, since the default MIME map has no entry for an extension-less AASA file), and `@capacitor/app`'s `appUrlOpen` listener (`DeepLinkService`) wired up — the package had been a dependency since Phase 22, unused until now
- [x] **Mobile — connexion/inscription screens get a standalone referral button** (not just a form field): `ReferralCodePromptComponent`, native-mobile-only ("J'ai un code de parrainage"), opening a small entry affordance
- [x] **Mobile — best-effort deferred-link detection**: on first native launch, the connexion/inscription screen makes one best-effort clipboard read (`@capacitor/clipboard`, wrapped in try/catch, gated to once per install via a `localStorage` flag) and — only if it matches the referral-code shape — turns the standalone button above into a pre-filled proposal ("Code détecté, l'utiliser ?") rather than auto-applying it
- [ ] **Not built: a web fallback "copier le code et ouvrir le Store" nudge** for the link-tapped-before-install case. Deliberately dropped rather than half-built: neither app is on the App Store/Play Store yet (Phase 22 left store submission as a separate future step), so a "open the Store" button would point at a listing that doesn't exist — the same "never fabricate a URL/placeholder" posture as `SiteLegalInfo` starting empty rather than with invented text. Revisit once Phase 22's store submission actually ships; mobile web registration works fully today regardless (the `?ref=` prefill above needs no app install at all)

## Non-goals

- **No third-party attribution SDK** (Branch, AppsFlyer, Adjust, Firebase Dynamic Links — the last of which is shut down anyway). True deferred deep linking (a code surviving an App Store/Play Store round-trip with zero user action) is not achievable without one; the clipboard-based fallback above is a deliberate, honest best-effort substitute, not a claimed equivalent.
- **No referral-farming defense beyond email-verification-gating.** A referrer motivated enough to verify multiple real-looking throwaway inboxes can still farm parrain-months; no CAPTCHA, device fingerprinting, or per-referrer cap is built here. Worth revisiting only if abuse is actually observed.
- **No reward for a Google-OAuth-created referred account** in this pass (see Anti-Abuse section above) — email/password registration only.
- **No change to `PromoCode`/`PromoCodeRedemption`** — the parrain's reward is a parallel path into the same `premiumGrantedUntil` field, not a redeemable-code system of its own; the filleul's is a Stripe coupon, orthogonal to `PromoCode` entirely.
- **The filleul's discount is a fixed 5 € amount, not a literal 30% `percent_off`.** The user's own framing ("30%, de 15 à 10 €") doesn't square exactly (30% of 15€ is 4.50€, not 5€) — `amount_off: 500` was used instead of `percent_off` specifically so the result is always exactly 10€ regardless of that rounding, matching the concrete numbers given over the imprecise percentage.

## Notes

- Depends on Phase 13 (accounts/email verification), Phase 14 (`BillingRepository.grantPremiumDays`, the "Mon abonnement" page), and Phase 22 (Capacitor shell, `PlatformService`, the still-unresolved `facturele.net` domain TODO in `capacitor.config.ts` — the Universal/App Links work in this phase inherits that same open dependency and cannot be finalized/tested end-to-end until that domain is confirmed live).
- `@capacitor/app` has sat in `frontend/package.json` unused since Phase 22 scaffolding — this is the first phase that actually wires it up.

## Implementation notes

- **`referralCode` backfill migration was hand-written, not `prisma migrate dev`.** Same "nullable column → backfill → tighten to NOT NULL" shape as Phase 7's unit-enum migration: `prisma migrate dev` refuses to add a required unique column to a non-empty `Company` table non-interactively, so `20260727214839_referral_program/migration.sql` adds the column nullable, backfills every existing row with `upper(substr(md5(gen_random_uuid()::text || id), 1, 10))`, then tightens it. Verified against the real dev DB (2 pre-existing companies at the time). A second migration (`20260727223548_referral_discount`) added `pendingReferralDiscount` once the reward mechanism was corrected — a plain additive `BOOLEAN NOT NULL DEFAULT false`, no backfill needed.
- **The reward is not granted at registration — it's granted at email verification.** `AuthService.register()` only creates a `Referral` row (`rewardGrantedAt: null`) via `ReferralService.attributeReferral()`; both sides of the reward fire from `AuthService.verifyEmail()`, right after `markEmailVerified()`, via `ReferralService.grantRewardForVerifiedEmail()`. This is the one deliberate anti-abuse speed bump in this phase (see the Anti-Abuse section above).
- **This reward assignment (parrain = free month / filleul = discount) reverses two earlier drafts of this same phase within the same conversation** — first "both sides get a free month," then briefly "parrain = discount / filleul = free month" — before landing here, at the user's explicit correction, as the final, intentional shape: a parrain who's already a customer is rewarded with more of the product they already value (a free month), while a brand-new filleul is rewarded with a lower price to help convert them into a paying subscriber in the first place — the standard shape of a referral program (existing customer gets appreciation, new prospect gets a conversion incentive).
- **`BillingService.grantReferralDiscount(companyId)` is the filleul-side entry point**, symmetric to `grantPremiumDays` on the parrain side but Stripe-specific: it checks `stripeClient.isConfigured()` first (a no-op deployment-wide if Stripe billing isn't set up at all — same "optional feature" posture as the rest of billing/), then branches on whether the filleul already has a live subscription (`stripeSubscriptionId` set and status `ACTIVE`/`PAST_DUE` → `StripeClientService.applyCouponToSubscription` immediately) or not (→ `BillingRepository.setPendingReferralDiscount(companyId, true)`, picked up by `createCheckoutSession`'s next call for this company and cleared once `applySubscriptionEvent`'s webhook confirms the resulting subscription — so an abandoned checkout never burns the reward).
- **One shared, fixed-id Stripe Coupon (`referral-filleul-5eur-1mois`), not one minted per referral.** `StripeClientService.ensureReferralDiscountCoupon()` looks it up first and only creates it on a genuine 404 — idempotent by construction, a concurrent creator racing the same id is treated as "it exists now" rather than surfaced as an error. `amount_off: 500` (not `percent_off`) so the result is always exactly 10€ — see the Non-goals note on the 30%-vs-5€ framing mismatch. `duration: 'once'` applies it to exactly one invoice (the filleul's first), never repeating.
- **Every `Company` gets a `referralCode`, including Google-OAuth signups and `make demo` seed companies** — `UserRepository.createWithCompany()`'s `referralCode` field is required, so `AuthService.handleGoogleLogin()` and `backend/prisma/seed-demo.ts`'s `createTenant()` both call the same generator (`generateReferralCode()`) as the email/password path, even though *capturing* an incoming referral code is email/password-only for now.
- **`ReferralModule` imports `BillingModule`, `AuthModule` imports `ReferralModule`** — same layering precedent as `AdminModule` importing `BillingModule` (Phase 14): no circular dependency, since `BillingModule` never reaches back into either.
- **The "Parrainage" section on `/abonnement` is gated behind `!platformService.isIosApp()`**, exactly like the neighboring "Code promo" section — a judgment call (not re-litigated live with the user this pass): the section's entire content is "here's how to earn premium access outside Stripe," which reads the same way to Apple's 3.1.1 reviewer as the promo-code section already does. The registration-time referral capture (login/register pages) is **not** gated this way — entering a code isn't itself a payment-adjacent action, only *displaying paths to earn/redeem premium* is.
- **`ReferralCodePromptComponent` is one shared component for both connexion and inscription**, with different `(codeConfirmed)` handlers: register.page.ts patches its own form control; login.page.ts (which has no account-creation form at all) navigates to `/inscription` with `?ref=` attached instead.
- **iOS/Android Universal/App Link wiring is config-only, not exercised on a real device** — same honest posture as Phase 22's own "not yet exercised on a real Xcode/Android Studio run" caveat, for the same reason (no Xcode/Android SDK in this environment). Concretely still open: `App.entitlements`'s associated-domains capability needs to actually be added to the Xcode target via Signing & Capabilities (no `CODE_SIGN_ENTITLEMENTS` build setting exists yet in `project.pbxproj` — dropping the file alone doesn't wire it in, same class of manual step as Phase 22's Firebase SPM dependency); `apple-app-site-association`'s `appIDs` still has a literal `TEAMID` placeholder (no Apple Developer Team ID exists yet); `assetlinks.json`'s `sha256_cert_fingerprints` still has a literal placeholder (no release signing key exists yet, per Phase 22's own notes). All three are grep-able markers, not silent guesses.