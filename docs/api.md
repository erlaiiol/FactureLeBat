# API Reference

Base URL: `http://localhost:3000/api` in dev, `/api` (same-origin, proxied by Nginx) in prod. All bodies are JSON unless noted.

No authentication yet (Phase 1 scope — see [roadmap.md](roadmap.md)). All requests are rate-limited to 100/min/IP.

## Health

### `GET /health`

```json
{ "status": "ok" }
```

## Company

The artisan's own business profile. Singleton — there is only ever one, auto-created with placeholder values on first `GET` if it doesn't exist yet.

### `GET /company`

Returns the current profile (auto-creating a default one if none exists yet).

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
| `addressLine1`        | string, 1-200 chars               |                                   |
| `addressLine2`        | string, ≤200 chars, optional      |                                   |
| `postalCode`          | string, 1-10 chars                |                                   |
| `city`                | string, 1-100 chars               |                                   |
| `email`               | string, valid email, optional     |                                   |
| `phone`               | string, ≤30 chars, optional       |                                   |
| `legalStatus`         | `"MICRO_ENTREPRENEUR"` \| `"COMPANY"` | drives VAT applicability on future invoices |
| `vatRateBasisPoints`  | integer, 0-10000                  | rate × 100, e.g. `2000` = 20.00% |
| `invoiceNumberPrefix` | string, 1-20 chars, optional      |                                   |

Returns the updated profile, same shape as `GET /company`.

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
| `customerName`                    | string, 1-200 chars           |                                                                     |
| `customerAddress`/`Email`/`Phone` | string, optional              | `Email` must be a valid email if present                          |
| `customerId`                      | string (UUID), optional       | soft reference to a saved `Customer` — confirmed to exist (`404` if not) but never overrides `customerName`/`Address`/`Email`/`Phone` above |
| `lines`                           | array, 1-200 items            |                                                                     |
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

### `GET /invoices/:id/pdf`

Streams the invoice as a PDF. `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="facture-{number}.pdf"`. `404` if the invoice doesn't exist.

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
