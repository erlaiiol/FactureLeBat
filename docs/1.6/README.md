# Phase 1.6 — Marge & Bénéfice: Profitability Statistics

Full detail moved to this folder up front, same posture as Phase 1.3/1.4 —
written before any code exists so the scope decisions below don't have to
be re-litigated once building actually starts. Status legend used
throughout this folder: `[ ]` not started, `[~]` in progress, `[x]` done.

## Objective

Every statistic FactureLe has today (Phase 17 Activity Analytics, Phase
1.3-6, the quarterly report) is revenue-shaped: how much came in, from
whom, on what. None of it says how much the artisan actually **keeps**.
Requested directly by the user (2026-09-02): add a margin/profit field to
the product and service catalog, and a new statistics view that shows
profitability broken down by product/service and by client — "ce qui
ramène le plus" — optionally crossed with the estimated-charges figure
Phase 17 already computes for micro-entrepreneurs, to get an honest
bottom-line "reste net dans la poche" number.

## Numbering note (2026-09-02)

`docs/roadmap.md` already has a **Phase 1.5 — Sign in with Apple**
(in progress, uncommitted at the time this track was created — see git
status). This track is numbered **1.6** to avoid colliding with it,
confirmed with the user.

## Scope decisions confirmed with the user (2026-09-02)

- **Margin lives on `Product` AND `Service`**, not just products. Same
  `marginMode` fork as `Service.pricingMode` already uses (Phase 13.5):
  either a net amount in euros, HT, per unit ("3€ sur les 6€ payés par le
  client") or a percentage of the item's own HT price, with a slider in
  the UI ("50% sur les 6€"). See [1.6-1](./1.6-1-margin-data-model.md).
- **Percentage is computed on the item's own HT catalog price**, not the
  TTC amount actually invoiced — consistent with this codebase's
  "everything is HT except the quarterly report's per-invoice audit rows"
  rule (see `ReportsService`'s own class comment).
- **The existing "Marge 30%" `REDISTRIBUTED` service trick (Phase 5's own
  onboarding example) is not special-cased.** The user's own reasoning,
  verbatim: some artisans won't use services at all — that's exactly why
  this field exists on `Product` directly. Artisans who *do* use a
  markup-service instead just set that service's own margin field, which
  can legitimately be **100%** (a pure-markup service has no cost basis of
  its own — the entire amount it bills over the underlying product line
  **is** the margin). Concretely: margin is resolved per invoice line from
  that line's own linked `Product`/`Service` margin config, for every
  service line regardless of `visibility` (`VISIBLE` and `REDISTRIBUTED`
  both count) — never re-derived from how Phase 17's revenue-category
  bucketing folds `REDISTRIBUTED` amounts into product lines, which is a
  answering a different question (whose *category* is this revenue, not
  whose *profit* is this margin). See
  [1.6-2](./1.6-2-margin-analytics-backend.md)'s per-line resolution.
- **Gated behind the same paid `analytics` plan feature as Activity
  Analytics** (Phase 30's "on peut légiférer sur les statistiques"
  precedent) — margin is a business-insight stat, not a legal necessity,
  same category as `topClients`/`topProducts`, not the free quarterly
  report or the free e-invoicing snapshot (1.3-6).
- **Net-profit-after-charges crossing reuses `computeEstimatedCharges`**
  (Phase 17), so it inherits that method's own honest scope limit:
  `applicable: false` for anything but `LegalStatus.MICRO_ENTREPRENEUR` —
  a `COMPANY`'s real IS/IR depends on deductible expenses this app has no
  way to know, so guessing would be actively misleading (same non-goal
  Phase 17 already documented, not reopened here).

## Phase index

| Phase | Title | Depends on | Status |
|---|---|---|---|
| [1.6-1](./1.6-1-margin-data-model.md) | Data Model: Margin Field on Product & Service | — | `[x]` |
| [1.6-2](./1.6-2-margin-analytics-backend.md) | Backend: Margin Analytics Computation | 1.6-1 | `[x]` |
| [1.6-3](./1.6-3-margin-stats-frontend.md) | Frontend: "Marge" Tab & Circular Breakdown Charts | 1.6-2 | `[x]` |

**Status: all three phases shipped and live-verified (2026-09-02)** —
schema + catalog forms, gated margin analytics computation, and the
"Marge" tab with donut breakdowns, all confirmed working end-to-end
against a real invoice on the demo stack. Two real bugs were caught by
that live pass (a coverage-percentage miscalculation and a raw UUID
leaking into a chart label) that no unit test had surfaced — see
[1.6-2](./1.6-2-margin-analytics-backend.md#two-more-corrections-found-live-against-the-real-demo-stack-not-caught-by-unit-tests)
for both. The e2e test suite (`test/*.e2e-spec.ts`) could not be run in
this environment — a pre-existing `beforeAll` hang affecting every spec
file, not just this track's new ones — so the round-trip tests added to
`product.e2e-spec.ts`/`service.e2e-spec.ts` are unverified code; re-run
them once that's fixed.

## Non-goals

- **No per-invoice margin display on the PDF or preview.** Margin is an
  internal profitability stat, never printed on a document a client sees
  — same spirit as this app never exposing a supplier cost on an invoice.
- **No snapshot of margin config on `InvoiceLine`/`InvoiceServiceLine`.**
  Unlike `activityCategory` (deliberately snapshotted because it feeds the
  free, legally-relevant quarterly report — see `schema.prisma`'s comment
  on `InvoiceLine.activityCategory`), margin analytics is a pure,
  never-printed business-insight number. It's resolved live from the
  catalog item's *current* margin config, same as `topProducts`/
  `topClients` already join live catalog rows for their labels. Trade-off
  accepted explicitly: editing a product's margin today changes what last
  month's margin report shows, unlike the quarterly report which is frozen
  the moment `activityCategory` was snapshotted. Revisit only if this
  proves confusing in practice — see [1.6-2](./1.6-2-margin-analytics-backend.md)'s
  own note.
- **No expense/cost tracking beyond the single margin field.** No supplier
  invoice reconciliation, no per-purchase cost history — the margin field
  is a flat, artisan-declared number, not a computed cost basis.
- **No margin field on `Discount`.** A remise reduces what's billed; it
  doesn't have a cost basis of its own to declare a margin against.

## Update (2026-09-03) — margin defaults to 100%, not "unconfigured"

Requested directly by the user: **the default margin for a catalog
`Product`/`Service` is now 100% — the whole price is assumed profit —
until the artisan touches that specific item's own margin field in its
"paramètres avancés."** This replaces the original behavior (an
untouched item contributed `0` margin and its revenue was excluded from
`marginCoveragePercent` as "uncategorized"), which made every fresh
company's margin stats read as empty/misleading rather than a useful
(if optimistic) starting estimate.

- **What changed**: `resolveMarginCents` (`backend/src/common/margin.util.ts`)
  now returns the line's full `baseAmountCents` when a real catalog
  `Product`/`Service` is linked but its `marginMode` is still `null`,
  instead of `0`. "Covered"/"uncategorized" (`marginCoveragePercent`,
  `uncategorizedRevenueExclVatCents`) now means "tied to a real catalog
  object at all" (custom margin or the 100% default alike) — a freehand
  line or a `MANUAL` invoice is still the only genuinely uncategorized
  case, since there's no object to assume anything about.
- **Informing the artisan**: an ⓘ info tooltip next to the "Marge" tab's
  coverage KPI (`stats-reports.page.html`) explains the 100% default
  assumption explicitly — same `<details>/<summary>` "click to reveal"
  pattern already used by the invoice totals summary's VAT info icon
  (no hover dependency, since artisans work from a job site). A matching
  hint also appears directly in the product/service form's margin block
  when "Non renseignée" is selected, so the assumption is visible right
  where the artisan would go to correct it.
- See [1.6-2](./1.6-2-margin-analytics-backend.md#update-2026-09-03--default-margin-is-100-not-uncategorized)
  for the full backend detail and the reasoning behind what still counts
  as genuinely uncategorized.

## Suggested extensions (flagged to the user, not all built in this pass)

Raised proactively per the user's own invitation to suggest improvements:

1. **Margin coverage figure** — what % of the period's revenue actually
   has a margin configured, so the stat is honest about being partial
   until the artisan fills in more catalog items. **Included in 1.6-2/1.6-3.**
2. **Average margin rate KPI** and **margin evolution month-by-month**
   (alongside the existing revenue bar chart) — **included**, see 1.6-2/1.6-3.
3. **Margin by client**, not just by product/service, as the user
   explicitly asked for — **included**.
4. **Net profit after estimated charges** (crosses with Phase 17) —
   **included**, see the scope decision above.
5. **Backlog, not built here**: a "low-margin, high-volume" nudge (flags a
   product that sells a lot but earns little, the kind of thing worth
   re-pricing) and a margin-data CSV export (mirrors the quarterly
   report's existing `csv.util.ts`). Both are natural 1.6-4 candidates if
   wanted later — not scoped in now to avoid building ahead of real usage.

## Cross-references

- Extends `ReportsService`/"Mon activité" rather than a new page family —
  same precedent 1.3-6 set for the e-invoicing snapshot.
- Reuses `PlanGateService.assertFeatureAccess(..., 'analytics')` (Phase 30)
  and `computeEstimatedCharges` (Phase 17) unchanged.
- Reuses the `ServicePricingConsistencyValidator`/`DiscountConsistencyValidator`
  cross-field-validation pattern (Phase 13.5/32) for the new margin fields.
