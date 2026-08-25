# API Reference

Base URL: `http://localhost:3000/api` in dev, `/api` (same-origin, proxied by Nginx) in prod. All bodies are JSON unless noted.

Every route below except `GET /health` requires a Bearer access token (Phase 13 — see [roadmap.md](roadmap.md)'s auth phases); this doc omits the header from each example for brevity. All requests are rate-limited to 100/min/IP.

## Health

### `GET /health`

```json
{ "status": "ok" }
```

## Company

The artisan's own business profile — one per registered account (`Company` is 1:1 with `User`, created at signup), scoped to whichever account the Bearer token belongs to. See [database.md](database.md#company--the-artisans-business-profile) for the corrected note on this (it used to be a true Phase 1 singleton before Phase 13's auth).

### `GET /company`

Returns the authenticated account's profile.

```json
{
  "id": "00000000-0000-0000-0000-000000000001",
  "name": "Parquets Raillere",
  "siret": "12345678900012",
  "addressLine1": "1 rue des Artisans",
  "addressLine2": null,
  "postalCode": "69001",
  "city": "Lyon",
  "email": null,
  "phone": null,
  "legalStatus": "MICRO_ENTREPRENEUR",
  "vatRateBasisPoints": 2000,
  "invoiceNumberPrefix": "F",
  "nextInvoiceNumber": 6,
  "createdAt": "2026-01-15T10:00:00.000Z",
  "updatedAt": "2026-01-15T10:00:00.000Z"
}
```

### `PATCH /company`

Full replace of the editable fields (not a partial patch despite the verb — every field below is required except where marked optional).

```json
{
  "name": "Parquets Raillere",
  "siret": "12345678900012",
  "addressLine1": "1 rue des Artisans",
  "addressLine2": null,
  "postalCode": "69001",
  "city": "Lyon",
  "email": null,
  "phone": null,
  "legalStatus": "MICRO_ENTREPRENEUR",
  "vatRateBasisPoints": 2000,
  "invoiceNumberPrefix": "F"
}
```

| Field                 | Type                             | Notes                            |
| ---------------------- | --------------------------------- | ---------------------------------- |
| `name`                | string, 1-200 chars               |                                   |
| `siret`               | string                            | exactly 14 digits                |
| `vatNumber`           | string, optional                  | Phase 1.2-2 — `FR` + 2-char key + 9-digit SIREN; blank for a franchise-en-base company with no VAT number |
| `addressLine1`        | string, 1-200 chars               |                                   |
| `addressLine2`        | string, ≤200 chars, optional      |                                   |
| `postalCode`          | string, 1-10 chars                |                                   |
| `city`                | string, 1-100 chars               |                                   |
| `email`               | string, valid email, optional     |                                   |
| `phone`               | string, ≤30 chars, optional       |                                   |
| `invoiceMailCustomMessage` | string, ≤500 chars, optional | appended to the default invoice/devis mail template on every send |
| `legalStatus`         | `"MICRO_ENTREPRENEUR"` \| `"COMPANY"` | drives VAT applicability on future invoices |
| `vatRateBasisPoints`  | integer, 0-10000                  | rate × 100, e.g. `2000` = 20.00% |
| `invoiceNumberPrefix` | string, 1-20 chars, optional      |                                   |
| `declarationFrequency` | `"MENSUELLE"` \| `"TRIMESTRIELLE"`, optional | Phase 17 — which period the quarterly-report screen preselects |
| `microEntrepreneurCeiling` | integer (cents) ≥ 0, optional | Phase 17 — the artisan's own plafond, indicative only (drives a warning banner, never a computed total) |
| `defaultDepositPercentageBasisPoints` | integer, 0-10000, optional | Phase 1.1-3 — habitual acompte rate, auto-proposed on every new FACTURE; omitted/`null` means no default |
| `cotisationVenteBasisPoints` | integer, 0-10000, optional | Phase 17 — micro-entrepreneur "cotisations sociales" rate for vente (marchandises) revenue |
| `cotisationPrestationBicBasisPoints` | integer, 0-10000, optional | Phase 17 — same, for BIC (prestations de service) revenue |
| `cotisationPrestationBncBasisPoints` | integer, 0-10000, optional | Phase 17 — same, for BNC (prestations libérales) revenue |
| `versementLiberatoireOptIn` | boolean, optional | Phase 17 — whether the charges estimate also includes versement libératoire |
| `decennialInsuranceApplicable` | boolean | BTP mandatory mention (art. L243-2 du Code des assurances) — makes the three fields below required when `true` |
| `decennialInsurerName` | string, 1-200 chars, required iff `decennialInsuranceApplicable` | |
| `decennialInsurancePolicyNumber` | string, 1-100 chars, required iff `decennialInsuranceApplicable` | |
| `decennialInsuranceCoverageArea` | string, 1-200 chars, required iff `decennialInsuranceApplicable` | |
| `customFooterMessage` | string, ≤1000 chars, optional | Phase 1.1-6 — free-text footer mention, no format imposed |
| `customFooterOnFacture` | boolean | Phase 1.1-6 — show `customFooterMessage` on factures |
| `customFooterOnDevis` | boolean | Phase 1.1-6 — show `customFooterMessage` on devis |
| `earlyPaymentDiscountMention` | string, ≤500 chars, optional | Phase 1.1-7 (Art. L441-9) — escompte-policy mention, DB-defaulted to "Pas d'escompte pour paiement anticipé." on every company so this is never silently missing |
| `vatOnDebitsOption` | boolean | Phase 1.1-8 (2026 e-invoicing reform) — "option pour le paiement de la taxe d'après les débits" |
| `autoAttachFacturX` | boolean | Phase 1.3-1 (2026 e-invoicing reform, workflow automation) — attach the Factur-X hybrid instead of the plain PDF when emailing a FACTURE |
| `autoTransmitViaPa` | boolean | Phase 1.3-1 — automatically transmit new FACTUREs via the connected PA. Silently coerced back to `false` server-side if SUPER PDP isn't connected for this company, regardless of what's sent |
| `autoSyncReceivedInvoices` | boolean | Phase 1.3-1 — automatically sync the reception inbox in the background. Same server-side coercion as `autoTransmitViaPa` if not connected |

Every optional field above follows the same full-replace convention as the whole endpoint: an omitted optional field is cleared to `null`, not left unchanged. Fields marked `boolean` with no "optional" note are required on every request (the seven toggles above and `decennialInsuranceApplicable`) — omitting one is rejected with a validation error, not defaulted.

Returns the updated profile, same shape as `GET /company`.

### `GET /company/super-pdp/status`

Phase 1.2-4 (2026 e-invoicing reform). Returns `{ configured: boolean, connected: boolean }` — `configured` is app-wide (SUPER PDP OAuth2 credentials set on this deployment), `connected` is per-company (this artisan completed the OAuth2 consent).

### `GET /company/super-pdp/connect`

Redirects (302) the browser to SUPER PDP's own OAuth2 consent screen. `503` if not configured on this deployment.

### `GET /company/super-pdp/callback`

SUPER PDP redirects back here after consent. Not called directly by the frontend — redirects again to `{FRONTEND_URL}/entreprise?super_pdp=connected` or `?super_pdp=error`.

### `POST /company/super-pdp/disconnect`

Clears the stored OAuth2 tokens for this company. Returns `{ connected: false }`.

## Customers

Saved customers, reusable across invoices. Attaching one to an invoice is a
one-shot autofill on the frontend (see [conventions.md](conventions.md)) —
the backend never overwrites an invoice's own customer fields, it only
confirms `customerId` exists.

### `GET /customers`

Returns all customers, ordered by name. Optional `?search=` filters
case-insensitively on `name` or `companyName`.

### `GET /customers/:id`

Returns a single customer. `404` if the id doesn't exist.

### `POST /customers`

```json
{
  "name": "M. Dupont",
  "companyName": null,
  "address": "5 avenue des Clients, 69002 Lyon",
  "email": null,
  "phone": null,
  "siret": null
}
```

| Field         | Type                        | Notes                          |
| ------------- | ---------------------------- | -------------------------------- |
| `name`        | string, 1-200 chars           |                                 |
| `companyName` | string, ≤200 chars, optional  |                                 |
| `address`     | string, ≤300 chars, optional  |                                 |
| `email`       | string, valid email, optional |                                 |
| `phone`       | string, ≤30 chars, optional   |                                 |
| `siret`       | string, optional              | exactly 14 digits when present |
| `isProfessional` | boolean, optional (default `false`) | Phase 1.1-7 — the artisan's own declaration that this client buys for their business, not personally; drives L441-9 mentions on their factures. Not reliably inferable from `companyName`/`siret` alone, so never auto-derived server-side |
| `description` | string, ≤1000 chars, optional | Phase 14.5 — freehand notes; also searched by `?search=` alongside `name`/`companyName` |

**Response** `201 Created` — full customer record (`id`, `createdAt`, `updatedAt` included).

### `PATCH /customers/:id`

Full replace of the editable fields, same shape as the `POST` body and the
same convention as `PATCH /company` — an omitted optional field is cleared
to `null`, not left unchanged. `404` if the id doesn't exist.

## Products

The artisan's material catalog (Phase 3). No relation to invoices yet —
lines are still entered by hand on an invoice; the catalog exists so that
data entry point can be built on top of it later without another schema
change.

### `GET /products`

Returns all products, ordered by name. Optional `?search=` filters
case-insensitively on `name` or `supplierName`.

### `GET /products/:id`

Returns a single product. `404` if the id doesn't exist.

### `POST /products`

```json
{
  "name": "Parquet chêne massif",
  "description": "Parquet en chêne massif, pose collée, 14mm.",
  "unit": "SQUARE_METER",
  "priceCents": 4500,
  "supplierName": "Point P",
  "supplierUrl": "https://supplier.example.com/parquet-chene"
}
```

| Field          | Type                        | Notes                            |
| -------------- | ---------------------------- | ----------------------------------- |
| `name`         | string, 1-200 chars           |                                    |
| `description`  | string, ≤2000 chars, optional  |                                    |
| `unit`         | `Unit` enum                    | Phase 7 — `"SQUARE_METER"` \| `"LINEAR_METER"` \| `"UNIT"` \| `"LUMP_SUM"` \| `"HOUR"` \| `"DAY"` \| `"KILOGRAM"` \| `"LITER"` \| `"CUBIC_METER"`, no free text |
| `priceCents`   | integer ≥ 0                   | **integer cents**, same convention as invoice lines |
| `supplierName` | string, ≤200 chars, optional   |                                    |
| `supplierUrl`  | string, valid URL, optional    |                                    |

**Response** `201 Created` — full product record (`id`, `createdAt`, `updatedAt` included).

### `PATCH /products/:id`

Full replace of the editable fields, same shape as the `POST` body and the
same convention as `PATCH /company`/`PATCH /customers/:id` — an omitted
optional field is cleared to `null`. `404` if the id doesn't exist.

### `POST /products/import` (Phase 4)

Fetches a supplier product page and extracts a **draft** — nothing is
persisted by this endpoint. The artisan reviews/edits the result in the
product form before a separate `POST /products` call actually saves it (see
[conventions.md](conventions.md) — the same "autofill, never a lock" rule
as the Phase 2 customer picker).

```json
{ "url": "https://supplier.example.com/product/parquet-oak" }
```

| Field | Type                                | Notes |
| ----- | ------------------------------------ | ------- |
| `url` | string, valid `http`/`https` URL, ≤2000 chars |       |

**Response** `201 Created`:

```json
{
  "name": "Parquet chêne massif",
  "description": "Parquet en chêne massif, pose collée, 14mm.",
  "unit": "SQUARE_METER",
  "priceCents": 4500,
  "supplierName": "Point P",
  "supplierUrl": "https://supplier.example.com/product/parquet-oak"
}
```

Every field except `supplierUrl` is best-effort and may come back `null` —
extraction reads `schema.org/Product` JSON-LD first, then falls back to
Open Graph / `product:price:*` meta tags, then `<title>`. A `400` means the
page couldn't be imported (unreachable, blocked, wrong content type, too
large, or nothing extractable) — the error message is deliberately generic;
the form still works as a plain manual-entry form regardless.

**Security**: this endpoint fetches a URL supplied by the artisan, which is
an SSRF (Server-Side Request Forgery) risk surface by nature. It refuses to
connect to loopback, private, link-local, and cloud-metadata addresses —
validated at the exact moment of the outbound TCP connection (not a
separate up-front check) specifically to close the DNS-rebinding bypass.
See `backend/src/product/import/safe-fetcher.service.ts` and
`ip-guard.ts`. This route also has a stricter throttle
(10 requests/min/IP) than the rest of the API, since it triggers a real
outbound network call per request.

## Services

The artisan's catalog of non-material work (Phase 5) — labor, expertise,
misc charges. Same shape and conventions as `/products` (see above), minus
the supplier fields, plus `defaultVisibility`.

### `GET /services`

Returns all services, ordered by name. Optional `?search=` filters
case-insensitively on `name`.

### `GET /services/:id`

Returns a single service. `404` if the id doesn't exist.

### `POST /services`

```json
{
  "name": "Main-d'œuvre pose parquet",
  "description": "Pose collée, préparation du support incluse.",
  "priceCents": 25000,
  "defaultVisibility": "VISIBLE"
}
```

| Field               | Type                          | Notes                                             |
| -------------------- | ------------------------------ | ---------------------------------------------------- |
| `name`              | string, 1-200 chars            |                                                    |
| `description`       | string, ≤2000 chars, optional  |                                                    |
| `priceCents`        | integer ≥ 0                    | **integer cents**, same convention as `Product.priceCents` |
| `defaultVisibility` | `"VISIBLE"` \| `"REDISTRIBUTED"` | prefills (never locks) the visibility choice when this service is added to an invoice |

**Response** `201 Created` — full service record (`id`, `createdAt`,
`updatedAt` included).

### `PATCH /services/:id`

Full replace of the editable fields, same shape as the `POST` body and the
same convention as `PATCH /products/:id` — an omitted optional field is
cleared to `null`. `404` if the id doesn't exist.

## Invoices

### `POST /invoices`

Creates an invoice: computes totals server-side, assigns the next sequential number, persists, and returns it with computed totals attached.

```json
{
  "customerName": "M. Dupont",
  "customerAddress": "5 avenue des Clients, 69002 Lyon",
  "customerEmail": null,
  "customerPhone": null,
  "customerId": null,
  "lines": [
    {
      "description": "Parquet chêne massif posé",
      "unit": "SQUARE_METER",
      "quantity": 25.5,
      "unitPriceCents": 4500,
      "wasteSurcharge": "TEN"
    },
    {
      "description": "Plinthes",
      "unit": "UNIT",
      "quantity": 12,
      "unitPriceCents": 800
    }
  ],
  "serviceLines": [
    {
      "name": "Main-d'œuvre pose parquet",
      "amountCents": 25000,
      "visibility": "VISIBLE"
    },
    {
      "name": "Savoir-faire",
      "amountCents": 10000,
      "visibility": "REDISTRIBUTED",
      "redistributionStrategy": "WEIGHTED",
      "weights": [1, 3]
    }
  ]
}
```

| Field                             | Type                        | Notes                                                             |
| ----------------------------------- | ----------------------------- | --------------------------------------------------------------------- |
| `documentType`                    | `"DEVIS"` \| `"FACTURE"`, optional (default `"FACTURE"`) | Phase 14.3 — a devis is mechanically a facture: same fields, same pipeline, just a different label/numbering sequence and a handful of FACTURE-only fields below |
| `customerName`                    | string, 1-200 chars           |                                                                     |
| `customerAddress`/`Email`/`Phone` | string, optional              | `Email` must be a valid email if present                          |
| `customerSiret`                   | string, optional              | Phase 1.1-8 — exactly 14 digits when present; snapshotted separately from the saved `Customer.siret` since this app has to print it even when no `customerId` is attached |
| `deliveryAddress`                 | string, ≤300 chars, optional  | Phase 1.1-8 — the job-site address, when it differs from `customerAddress` |
| `customerFields`                  | array, ≤20 items, optional    | Phase 14.5 — freehand extra client fields, no fixed vocabulary     |
| `customerFields[].label`          | string, 1-100 chars           |                                                                     |
| `customerFields[].value`          | string, 1-300 chars           |                                                                     |
| `customerId`                      | string (UUID), optional       | soft reference to a saved `Customer` — confirmed to exist (`404` if not) but never overrides `customerName`/`Address`/`Email`/`Phone`/`Siret` above |
| `number`                          | string, 1-50 chars, optional  | Phase 27 — the artisan's own explicit document number, overriding the auto-suggested next number; letters/digits/spaces/`.`/`-`/`_` only |
| `convertedFromDevisId`            | string (UUID), optional       | Phase 14.3 — set only by the "Créer la facture à partir du devis" (editable) flow; must be one of this tenant's own devis |
| `lines`                           | array, 1-200 items (required for `entryMode: "GUIDED"`, forbidden for `"MANUAL"`) |                                                                     |
| `lines[].description`             | string, 1-300 chars           |                                                                     |
| `lines[].unit`                    | `Unit` enum                    | Phase 7 — `"SQUARE_METER"` \| `"LINEAR_METER"` \| `"UNIT"` \| `"LUMP_SUM"` \| `"HOUR"` \| `"DAY"` \| `"KILOGRAM"` \| `"LITER"` \| `"CUBIC_METER"`. Determines the calculation mode: only `"SQUARE_METER"` bills as quantity × unit price × (1 + waste %); every other unit bills as plain quantity × unit price, waste ignored. There is no separate `mode` field — the unit *is* the mode. |
| `lines[].quantity`                | number ≥ 0, ≤3 decimal places |                                                                     |
| `lines[].unitPriceCents`          | integer ≥ 0                   | **integer cents** — the client converts euros to cents once, before sending |
| `lines[].wasteSurcharge`          | `"NONE"` \| `"TEN"` \| `"TWENTY"`, optional (default `"NONE"`) | must be `"NONE"` unless `unit` is `"SQUARE_METER"` (rejected otherwise) |
| `serviceLines`                    | array, ≤50 items, optional (default none) | Phase 5 — services added to the invoice                |
| `serviceLines[].serviceId`        | string (UUID), optional       | soft reference to a saved `Service` — confirmed to exist (`404` if not), same "autofill, never overridden" rule as `customerId` |
| `serviceLines[].name`             | string, 1-200 chars           |                                                                     |
| `serviceLines[].description`      | string, ≤2000 chars, optional |                                                                     |
| `serviceLines[].amountCents`      | integer ≥ 0                   | **integer cents** — the full amount this service contributes        |
| `serviceLines[].visibility`       | `"VISIBLE"` \| `"REDISTRIBUTED"` | `VISIBLE`: own entry in the response/PDF. `REDISTRIBUTED`: hidden, folded into `lines[]` totals instead |
| `serviceLines[].redistributionStrategy` | `"EQUAL"` \| `"WEIGHTED"`, required iff `visibility` is `REDISTRIBUTED`, forbidden otherwise | `EQUAL`: split evenly across every `lines[]` entry. `WEIGHTED`: split per `weights` |
| `serviceLines[].weights`          | integer[] ≥ 0, required iff `redistributionStrategy` is `WEIGHTED`, forbidden otherwise | **Positional**, aligned with `lines` (`weights[i]` targets `lines[i]`) — length must equal `lines.length`, and must sum to more than zero |
| `discountLines`                   | array, ≤50 items, optional    | Phase 32 — remises applied to the invoice, forbidden for entryMode `MANUAL` |
| `discountLines[].discountId`      | string (UUID), optional       | soft reference to a saved `Discount` — `name`/`amountCents` below are always what's actually persisted, never re-read from the record |
| `discountLines[].name`           | string, 1-200 chars           |                                                                     |
| `discountLines[].amountCents`    | integer ≥ 0                   | resolved amount — a `PERCENTAGE` discount is resolved to a concrete cents figure client-side before sending |
| `discountLines[].targetLineIndex` | integer ≥ 0, optional         | Phase 34 — scopes this remise to `lines[i]`; mutually exclusive with `targetServiceLineIndex`, both absent means it applies to the invoice's general total |
| `discountLines[].targetServiceLineIndex` | integer ≥ 0, optional | same as `targetLineIndex`, aligned with `serviceLines` instead |
| `simplifiedDisplay`               | boolean, optional (default `false`) | Phase 23 — hides the Quantité/Prix unitaire columns on the PDF, leaving only description + line total |
| `depositPercentageBasisPoints`/`depositAmountCents` | integer, optional, required together | Phase 1.1-3 — the requested acompte; FACTURE-only. `depositAmountCents` (0-100,000,000) is the resolved euro amount actually printed/tracked, `depositPercentageBasisPoints` (0-10000) is kept alongside purely so the PDF can print the rate that produced it |
| `reverseChargeApplicable`        | boolean, optional              | Phase 1.1-7 — "Autoliquidation (sous-traitance BTP)", art. 242 nonies A 13° de l'annexe II au CGI. FACTURE-only, but usable from both `GUIDED` and `MANUAL` (unlike the VAT overrides below) since VAT correctness for BTP subcontracting can't wait for manual mode |

`vatApplicableOverride`/`vatRateBasisPointsOverride`/`subtotalOverrideCents`/`vatOverrideCents`/`totalOverrideCents`/`manualNatureOfOperation` are manual-mode-only (forbidden for `GUIDED`, where all six stay purely derived) — see [Manual invoice mode](#manual-invoice-mode-phase-95) below.

Redistribution math is always integer-cents, with any rounding remainder
assigned deterministically (largest-remainder method) — see
[architecture.md](architecture.md#service-lines-phase-5). Both service
visibility modes increase the invoice's displayed total by exactly
`amountCents`.

**Response** `201 Created` — see the shared invoice shape below.

#### Manual invoice mode (Phase 9.5)

The body above is for the default `entryMode: "GUIDED"`. Setting `entryMode: "MANUAL"` swaps `lines`/`serviceLines` for a `manualTable` instead — the two are mutually exclusive, enforced at the DTO boundary:

```json
{
  "customerName": "M. Dupont",
  "entryMode": "MANUAL",
  "manualTable": {
    "columns": [
      { "role": "DESCRIPTION", "label": "Désignation" },
      { "role": "QUANTITY", "label": "Quantité" },
      { "role": "UNIT_PRICE", "label": "Prix unitaire" },
      { "role": "CUSTOM", "label": "Chantier" }
    ],
    "rows": [
      { "cells": ["Parquet chêne massif", "10", "45.00", "Réf. C-102"] }
    ]
  }
}
```

| Field                            | Type                        | Notes                                                             |
| ----------------------------------- | ----------------------------- | --------------------------------------------------------------------- |
| `entryMode`                       | `"GUIDED"` \| `"MANUAL"`, optional (default `"GUIDED"`) | `GUIDED` requires `lines` (≥1) and forbids `manualTable`; `MANUAL` requires `manualTable` and forbids `lines`/`serviceLines` |
| `manualTable.columns`             | array, 3-12 items              | exactly one `DESCRIPTION`, one `QUANTITY`, and one `UNIT_PRICE` column required; any number of `CUSTOM` columns allowed |
| `manualTable.columns[].role`      | `"DESCRIPTION"` \| `"QUANTITY"` \| `"UNIT_PRICE"` \| `"CUSTOM"` |                                                    |
| `manualTable.columns[].label`     | string, 1-100 chars            |                                                                     |
| `manualTable.columns[].widthPx`   | integer, 40-800, optional      | persisted column width from the canvas's drag-resize handle           |
| `manualTable.rows`                | array, 1-200 items              |                                                                     |
| `manualTable.rows[].heightPx`     | integer, 24-400, optional       | persisted row height from the canvas's drag-resize handle             |
| `manualTable.rows[].cells`        | string[], ≤2000 chars each      | **Positional**, aligned with `manualTable.columns` (`cells[i]` targets `columns[i]`) — same convention as `serviceLines[].weights`. The `DESCRIPTION` cell must be non-empty; the `QUANTITY`/`UNIT_PRICE` cells must parse as a non-negative decimal (comma or dot separator accepted) |
| `subtotalOverrideCents`          | integer ≥ 0, optional          | manual mode's own aggregate figures, freely overridable — same "nothing computed behind the artisan's back" principle as a `LINE_TOTAL` cell, extended to the whole invoice. Forbidden for `GUIDED`, where this stays purely derived |
| `vatOverrideCents`               | integer ≥ 0, optional          | same as `subtotalOverrideCents`, for the VAT figure |
| `totalOverrideCents`             | integer ≥ 0, optional          | same as `subtotalOverrideCents`, for the grand total |
| `vatApplicableOverride`          | boolean, optional              | whether VAT applies at all on this one manual invoice, overriding the company's own fixed treatment — e.g. mixing a 5.5% énergie-rénovation job with a standard 20% one in the same week. Forbidden for `GUIDED` |
| `vatRateBasisPointsOverride`     | integer, 0-10000, optional     | the rate itself, same scope as `vatApplicableOverride` |
| `manualNatureOfOperation`        | `"LIVRAISON_BIENS"` \| `"PRESTATION_SERVICES"` \| `"BIENS_ET_SERVICES"`, optional | Phase 1.1-8 — explicit "nature de l'opération" (`GUIDED` derives this instead); omitted here defaults to `"PRESTATION_SERVICES"` |

A manual row is priced exactly like a `GUIDED` line whose `unit` is `"UNIT"` — plain `quantity × unitPriceCents`, no waste surcharge, no packaging (neither concept exists on the manual canvas). A `CUSTOM` column's cells are informational text only, never summed into any total.

### `GET /invoices`

Returns up to the 200 most recently dated invoices (see [database.md](database.md) — real pagination is a future improvement, not yet needed at this scale), newest first.

### `GET /invoices/:id`

Returns a single invoice. `404` if the id doesn't exist.

**Shared invoice response shape** (`POST`, list items, and single-invoice response are all this shape):

```json
{
  "id": "bbb6bf7a-99b5-4c4b-b895-de8e2443f07c",
  "number": "F-000001",
  "date": "2026-01-15T10:00:00.000Z",
  "customerName": "M. Dupont",
  "customerAddress": "5 avenue des Clients, 69002 Lyon",
  "customerEmail": null,
  "customerPhone": null,
  "customerId": null,
  "vatApplicable": false,
  "vatRateBasisPoints": 2000,
  "entryMode": "GUIDED",
  "lines": [
    {
      "id": "04f3f798-0ea8-47f1-bf79-d0e778200c83",
      "position": 0,
      "description": "Parquet chêne massif posé",
      "unit": "SQUARE_METER",
      "quantity": "25.5",
      "unitPriceCents": 4500,
      "wasteSurcharge": "TEN",
      "lineTotalExclVatCents": 126225
    }
  ],
  "serviceLines": [
    {
      "id": "9c6a7e3d-3d2a-4b8b-9d0e-2a6f9b6e7a10",
      "position": 0,
      "name": "Savoir-faire",
      "description": null,
      "amountCents": 10000,
      "visibility": "REDISTRIBUTED",
      "distribution": [
        { "invoiceLineId": "04f3f798-0ea8-47f1-bf79-d0e778200c83", "amountCents": 2500 }
      ]
    }
  ],
  "subtotalExclVatCents": 135825,
  "vatAmountCents": 0,
  "totalInclVatCents": 135825
}
```

Note `quantity` is serialized as a **string** (not a number) — see [database.md](database.md#invoiceline) for why. All monetary fields are integer cents.

`serviceLines[].lineTotalExclVatCents` above is already folded into the
matching `lines[].lineTotalExclVatCents` for a `REDISTRIBUTED` line —
`serviceLines[].distribution` is exposed purely for transparency (so the
artisan/frontend can see where a hidden amount actually went), it is not
an additional amount to add anywhere. `distribution` is only present for
`REDISTRIBUTED` service lines; a `VISIBLE` one has no such field.

**Phase 9.5**: for a `MANUAL` invoice, `entryMode` is `"MANUAL"`, `lines`/`serviceLines` are always empty arrays, and a `manualTable` field is present instead:

```json
{
  "entryMode": "MANUAL",
  "lines": [],
  "serviceLines": [],
  "manualTable": {
    "columns": [
      { "id": "…", "position": 0, "role": "DESCRIPTION", "label": "Désignation", "widthPx": 280 },
      { "id": "…", "position": 1, "role": "QUANTITY", "label": "Quantité", "widthPx": 100 },
      { "id": "…", "position": 2, "role": "UNIT_PRICE", "label": "Prix unitaire", "widthPx": 140 }
    ],
    "rows": [
      {
        "id": "…",
        "position": 0,
        "heightPx": 44,
        "cells": [
          { "columnId": "…", "value": "Parquet chêne massif" },
          { "columnId": "…", "value": "10" },
          { "columnId": "…", "value": "45.00" }
        ],
        "lineTotalExclVatCents": 45000
      }
    ]
  }
}
```

`manualTable.rows[].lineTotalExclVatCents` is never persisted — recomputed on every read from the `QUANTITY`/`UNIT_PRICE` cells, same "derived data is never persisted" rule as every other total in this API.

> The two JSON examples above predate several 1.1-x/Phase 16+ additions (`documentType`/`status`, `discountLines`, the deposit fields, `customerSiret`/`deliveryAddress`, `reverseChargeApplicable`, signature presence, folder assignments, …) — this phase brought the **request** table above current but didn't rebuild these **response** examples field-by-field; every response field is still exactly what its own request-side row above describes, just not re-illustrated here. Treat the request table as authoritative until a future pass rebuilds these examples too.

### `GET /invoices/:id/pdf`

Streams the invoice as a PDF. `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="facture-{number}.pdf"`. `404` if the invoice doesn't exist.

### `GET /invoices/:id/facturx`

Phase 1.2-3 (2026 e-invoicing reform). Same as `GET /invoices/:id/pdf`, but as a Factur-X (BASIC profile) PDF/A-3 hybrid with the CII XML embedded — `Content-Disposition: attachment; filename="facture-{number}-factur-x.pdf"`. **FACTURE-only**: `400` for a DEVIS (a quote isn't a fiscal invoice, the reform doesn't apply to it). `422` if the generated document fails Factur-X schema validation (should not happen for a well-formed invoice — see `invoice/facturx/facturx.service.ts`).

### `POST /invoices/:id/transmit`

Phase 1.2-4 (2026 e-invoicing reform). Generates the Factur-X hybrid (same pipeline as the endpoint above) and submits it through the connected PA (SUPER PDP). FACTURE-only, same 400 as above. Returns the updated `InvoiceWithTotals` (`eInvoiceTransmissionStatus` becomes `"SENT"`). `503` if SUPER PDP isn't configured on this deployment (`SUPERPDP_CLIENT_ID`/`SUPERPDP_CLIENT_SECRET` unset) or this company hasn't completed the OAuth2 connection yet (see `GET /company/super-pdp/status`). `409` (Phase 1.3-3) if `eInvoiceTransmissionStatus` isn't `"NOT_SENT"` or `"REJECTED"` — this invoice already has a live copy at the PA, re-transmitting would create a duplicate rather than update it.

### `POST /invoices/:id/transmission-status`

Phase 1.2-4. Re-fetches this invoice's latest status from the connected PA and persists it — an on-demand refresh, not a background poll. Returns the updated `InvoiceWithTotals`. `503` (SUPER PDP unavailable, same as above) if this invoice was never transmitted.

### `POST /invoices/:id/cancel-auto-transmit`

Phase 1.3-3 (2026 e-invoicing reform, workflow automation). Cancels a still-pending automatic PA transmission (see `Company.autoTransmitViaPa` — `PATCH /company`) — sets `scheduledTransmitAt` back to `null` on the invoice and records `transmitCancelledAt`. Returns the updated `InvoiceWithTotals`. Never errors for an invoice that's already been sent or whose auto-transmission was already cancelled (a slow double-click is harmless); `404` only for an invoice that doesn't exist for this company. A FACTURE gets `scheduledTransmitAt` set automatically at creation when `autoTransmitViaPa` is on and SUPER PDP is connected — a 20-minute grace period before `AutoTransmitCronService`'s sweep actually calls `POST /invoices/:id/transmit` on it.

> `docs/api.md`'s usual request/response field-table treatment wasn't done for these e-invoicing routes or for `GET /company/super-pdp/*` below — deferred the same way Phase 1.1-12 deferred and later caught up a batch of drift, rather than done piecemeal per phase. A future documentation pass should also add the `EInvoiceTransmissionStatus`/`eInvoiceRejectionReason`/`scheduledTransmitAt` fields to `InvoiceWithTotals`'s own response shape.

## Received Invoices

Phase 1.2-5 (2026 e-invoicing reform). A read-only inbox for supplier invoices received through the connected PA (SUPER PDP) — no reply/dispute/payment-initiation actions, no expense/reporting integration (see `docs/roadmap.md` Phase 1.2-5's own non-goals).

### `GET /received-invoices`

Lists this company's stored received invoices, most recent `issueDate` first. Each item: `id`, `issuerName`, `issuerSiret`, `number`, `issueDate`, `totalInclVatCents`, `vatAmountCents`, `currencyCode`, `receivedAt` — all nullable except `id`/`receivedAt` (a supplier's own invoice could be missing any EN16931 field depending on their compliance).

### `POST /received-invoices/sync`

Fetches whatever's new from SUPER PDP (`direction=in`) and stores it — an on-demand action, not a background poll or webhook (SUPER PDP's public API documents no webhook mechanism). Returns the full updated list, same shape as `GET /received-invoices`. `503` if SUPER PDP isn't configured/connected, same as the transmission endpoints above.

### `GET /received-invoices/:id/download`

Proxies the original document live from SUPER PDP (`format=factur-x`, a human-readable PDF regardless of the supplier's original format) — never cached locally. `404` if the id doesn't belong to this company. `503` (SUPER PDP unavailable) as above.

## Company (continued) — SUPER PDP reception

No new routes: reception reuses `GET /company/super-pdp/status`/`connect`/`disconnect` from Phase 1.2-4 — one PA connection serves both directions.

## Reports

> `GET /reports/quarterly`/`quarterly/pdf`/`quarterly/csv`/`analytics` predate this doc's per-endpoint treatment and aren't documented here yet — only the one new route below is. `GET /reports/analytics` is gated behind a Pro+/Premium plan (`PlanFeatureLocked` 402, Phase 30); `GET /reports/quarterly*` is free on every tier (a legal necessity, not a business-insight nice-to-have).

### `GET /reports/e-invoicing-snapshot`

Phase 1.3-6 (2026 e-invoicing reform, workflow automation). A compliance snapshot for "Mon activité" — **deliberately ungated**, unlike `GET /reports/analytics` right above it: same "legal necessity" reasoning that already keeps the quarterly report free on every tier. `configured`/`connected` mirror `GET /company/super-pdp/status`. `transmissionRatePercent` is `null` (never `0`) when `facturesInWindow` is `0` — nothing to divide by, which reads very differently from "0% compliant." `facturesInWindow`/`transmittedFacturesInWindow`/`receivedInvoiceCount` are scoped to the same rolling 12-month window as `GET /reports/analytics`; `unsentFactureCount` is the one exception, scoped to the whole book (same reasoning as `analytics.unsignedFactureCount`).

```json
{
  "configured": true,
  "connected": true,
  "facturesInWindow": 12,
  "transmittedFacturesInWindow": 9,
  "transmissionRatePercent": 75,
  "unsentFactureCount": 3,
  "receivedInvoiceCount": 4
}
```

## Errors

Standard Nest HTTP exception shape:

```json
{ "statusCode": 400, "error": "Bad Request", "message": ["siret must be exactly 14 digits"] }
```

| Status | When                                                                 |
| ------- | ----------------------------------------------------------------------- |
| 400    | DTO validation failed (`message` is an array of human-readable reasons), or `POST /products/import` couldn't extract anything usable |
| 404    | Invoice/Customer/Product/Service id not found — including on `PATCH`, not just `GET` |
| 429    | Rate limit exceeded — 100 req/min/IP by default, tightened to 10 req/min/IP for `POST /products/import` |
| 500    | Unhandled server error (no internal details are leaked in the response) |
