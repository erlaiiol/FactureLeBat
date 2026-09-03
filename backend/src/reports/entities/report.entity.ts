import { ActivityCategory } from '../../../generated/prisma/enums';

// "Non catégorisé" is deliberately not a value of ActivityCategory itself
// (see docs/roadmap.md Phase 17 — the enum only models the three real
// URSSAF categories) — it's a synthetic bucket key ReportsService assigns to
// any line/service line whose activityCategory snapshot is null, so nothing
// billed is ever silently dropped from the report total.
export const UNCATEGORIZED = 'NON_CATEGORISE' as const;
export type ReportCategory = ActivityCategory | typeof UNCATEGORIZED;

export interface CategoryTotal {
  category: ReportCategory;
  totalExclVatCents: number;
}

// One row of the report's audit trail — enough for the artisan to cross-check
// the total against their own bank statements/invoice history, never just a
// bare number to trust blindly (see docs/roadmap.md Phase 17).
export interface ReportInvoiceEntry {
  id: string;
  number: string;
  customerName: string;
  paidAt: Date;
  totalInclVatCents: number;
}

// Year-to-date encaissements against Company.microEntrepreneurCeiling — only
// present when that field is set (see CompanyController/CompanyProfile).
export interface PlafondWarning {
  ceilingCents: number;
  yearToDateCents: number;
  percentageUsed: number;
}

// One category's contribution to the estimated charges — never includes
// UNCATEGORIZED (see EstimatedCharges.uncategorizedExclVatCents below): there
// is no rate to apply to turnover the artisan hasn't told the app how to
// classify.
export interface EstimatedChargesCategoryRow {
  category: ActivityCategory;
  totalExclVatCents: number;
  cotisationRateBasisPoints: number;
  cotisationCents: number;
  versementLiberatoireRateBasisPoints: number;
  versementLiberatoireCents: number;
}

// A same-legal-status-under-French-law estimate of what the artisan owes on
// this period's encaissements — cotisations sociales URSSAF (mandatory) plus
// the versement libératoire de l'impôt sur le revenu (only if the company
// opted in). Deliberately narrow: `applicable` is false for anything other
// than legalStatus MICRO_ENTREPRENEUR (see docs/roadmap.md Phase 17's
// non-goals — a real company's IS/IR depends on deductible expenses this app
// has no way to know, so guessing would be actively misleading rather than
// merely imprecise). Always an *estimate*: it doesn't know about ACRE, a
// mid-period regime change, or a rate correction the artisan hasn't updated
// in Mon entreprise yet.
export interface EstimatedCharges {
  applicable: boolean;
  versementLiberatoireOptIn: boolean;
  rows: EstimatedChargesCategoryRow[];
  // Turnover left in the "non catégorisé" bucket — excluded from the
  // estimate entirely (no rate to apply), called out explicitly so the
  // total estimate reads as a floor, not a silently wrong full number.
  uncategorizedExclVatCents: number;
  cotisationsSocialesCents: number;
  versementLiberatoireCents: number;
  totalEstimatedCents: number;
}

// Phase 17: computed on demand from PAYEE invoices whose paidAt falls in the
// requested period — never a stored entity, same "derived data is never
// persisted" convention as invoice totals (see docs/conventions.md).
// totalExclVatCents (not TTC) is the declaration-relevant figure: VAT
// collected isn't the artisan's own turnover, it's remitted to the state —
// URSSAF's own "chiffre d'affaires encaissé" is HT. The invoice list below
// still shows totalInclVatCents per row, since that's the amount that
// actually landed in the artisan's bank account and is what they'll
// cross-check this report against.
export interface QuarterlyReport {
  from: string;
  to: string;
  totalExclVatCents: number;
  byCategory: CategoryTotal[];
  invoices: ReportInvoiceEntry[];
  plafondWarning: PlafondWarning | null;
  estimatedCharges: EstimatedCharges;
}

export interface RevenueMonthPoint {
  month: string; // "2026-01"
  totalExclVatCents: number;
}

export interface TopEntry {
  label: string;
  totalCents: number;
  count: number;
}

// Phase 17: "Mon activité"'s dashboard — see docs/roadmap.md's Activity
// Analytics feature list. Scoped to the same 12-month PAYEE window as
// revenueByMonth for topClients/topProducts/topServices/invoiceCount/
// averageInvoiceValueCents/activeClientCount/activeProductCount, so every
// figure here describes the same "last 12 months of actual activity" —
// outstandingTotalCents is the one exception, since unpaid invoices have no
// paidAt to scope by.
export interface ActivityAnalytics {
  revenueByMonth: RevenueMonthPoint[];
  topClients: TopEntry[];
  topProducts: TopEntry[];
  topServices: TopEntry[];
  outstandingTotalCents: number;
  invoiceCount: number;
  averageInvoiceValueCents: number;
  activeClientCount: number;
  activeProductCount: number;
  // Phase 1.1-1: every FACTURE (any status but ANNULEE, unpaid or already
  // paid alike) with no signature proof and no manual fallback checked —
  // see InvoiceRepository.countUnsigned. Unlike every other field above,
  // deliberately NOT scoped to the 12-month analytics window: a legal-risk
  // count should surface the whole book, not just recent activity, same
  // "one more exception" reasoning as outstandingTotalCents.
  unsignedFactureCount: number;
}

// Phase 1.3-6 (2026 e-invoicing reform, workflow automation): a compliance
// snapshot, deliberately NOT part of ActivityAnalytics above — see
// ReportsService.getEInvoicingSnapshot's own comment for why this is a
// separate, ungated method/endpoint rather than a few more fields folded
// into the (Phase 30-gated) analytics payload.
// Phase 1.6: one product/service/client's contribution to Margin Analytics
// — the "cercles" data source. marginRatePercent is null (not 0) on a
// zero-revenue bucket, same "nothing to divide by" convention as
// EInvoicingSnapshot.transmissionRatePercent below.
export interface MarginByEntry {
  label: string;
  revenueExclVatCents: number;
  marginExclVatCents: number;
  marginRatePercent: number | null;
  count: number;
}

export interface MarginMonthPoint {
  month: string; // "2026-01", same shape as RevenueMonthPoint
  revenueExclVatCents: number;
  marginExclVatCents: number;
}

// Only meaningful for LegalStatus.MICRO_ENTREPRENEUR — mirrors
// EstimatedCharges.applicable exactly (same computeEstimatedCharges call,
// over Margin Analytics' own 12-month window rather than the quarterly
// report's arbitrary range). netCents is never floored at 0 — a negative
// net is a real, honest figure, not an error to hide.
export interface NetProfitAfterCharges {
  applicable: boolean;
  totalMarginExclVatCents: number;
  estimatedChargesCents: number;
  netCents: number;
}

// Phase 1.6: "Marge" tab — see docs/1.6/1.6-2-margin-analytics-backend.md.
// Same 12-month PAYEE window as ActivityAnalytics, gated behind the same
// paid `analytics` plan feature (ReportsService.getMarginAnalytics).
export interface MarginAnalytics {
  totalRevenueExclVatCents: number;
  totalMarginExclVatCents: number;
  marginRatePercent: number | null;
  // % of totalRevenueExclVatCents that had a resolvable margin config —
  // this stat is honest about being partial until the artisan configures
  // more catalog items, never silently treats "unconfigured" as "zero
  // margin."
  marginCoveragePercent: number | null;
  uncategorizedRevenueExclVatCents: number;
  marginByProduct: MarginByEntry[];
  marginByService: MarginByEntry[];
  marginByClient: MarginByEntry[];
  marginByMonth: MarginMonthPoint[];
  netProfitAfterCharges: NetProfitAfterCharges;
}

export interface EInvoicingSnapshot {
  // App-wide (SUPERPDP_CLIENT_ID/SECRET set on this deployment at all) and
  // per-company (this artisan completed the OAuth2 connection) — same two-
  // level distinction the rest of the e-invoicing UI already uses (see
  // CompanySuperPdpController's own status endpoint).
  configured: boolean;
  connected: boolean;
  // Same rolling window as the rest of Activity Analytics
  // (ANALYTICS_WINDOW_MONTHS) — how many FACTUREs were created in that
  // window, and how many of those are no longer NOT_SENT. Null rate means
  // "nothing to divide by," not "0% compliant."
  facturesInWindow: number;
  transmittedFacturesInWindow: number;
  transmissionRatePercent: number | null;
  // Deliberately NOT windowed, same "legal-risk count surfaces the whole
  // book" reasoning as ActivityAnalytics.unsignedFactureCount above — an
  // un-transmitted FACTURE from 13 months ago is still un-transmitted.
  unsentFactureCount: number;
  // Windowed (unlike unsentFactureCount) — this is an activity count, not
  // a risk count. Count only, per Phase 1.2-5's own "never expose the
  // documents themselves outside the reception inbox" reasoning.
  receivedInvoiceCount: number;
}
