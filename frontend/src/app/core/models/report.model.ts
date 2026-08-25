export type ActivityCategory = 'VENTE_MARCHANDISES' | 'PRESTATION_BIC' | 'PRESTATION_BNC';

// Phase 17: which cadence the artisan declares turnover on — purely a UI
// default for which period the report screen preselects.
export type DeclarationFrequency = 'MENSUELLE' | 'TRIMESTRIELLE';

// "Non catégorisé" mirrors the backend's synthetic bucket key (see
// backend/src/reports/entities/report.entity.ts's UNCATEGORIZED) — not a
// real ActivityCategory value.
export type ReportCategory = ActivityCategory | 'NON_CATEGORISE';

export const CATEGORY_LABELS: Record<ReportCategory, string> = {
  VENTE_MARCHANDISES: 'Vente de marchandises',
  PRESTATION_BIC: 'Prestation de services (BIC)',
  PRESTATION_BNC: 'Prestation de services (BNC)',
  NON_CATEGORISE: 'Non catégorisé',
};

export const ACTIVITY_CATEGORY_OPTIONS: { value: ActivityCategory; label: string }[] = [
  { value: 'VENTE_MARCHANDISES', label: CATEGORY_LABELS.VENTE_MARCHANDISES },
  { value: 'PRESTATION_BIC', label: CATEGORY_LABELS.PRESTATION_BIC },
  { value: 'PRESTATION_BNC', label: CATEGORY_LABELS.PRESTATION_BNC },
];

export interface CategoryTotal {
  category: ReportCategory;
  totalExclVatCents: number;
}

export interface ReportInvoiceEntry {
  id: string;
  number: string;
  customerName: string;
  paidAt: string;
  totalInclVatCents: number;
}

export interface PlafondWarning {
  ceilingCents: number;
  yearToDateCents: number;
  percentageUsed: number;
}

export interface EstimatedChargesCategoryRow {
  category: ActivityCategory;
  totalExclVatCents: number;
  cotisationRateBasisPoints: number;
  cotisationCents: number;
  versementLiberatoireRateBasisPoints: number;
  versementLiberatoireCents: number;
}

// A French-law estimate of what's owed on this period's encaissements —
// cotisations sociales URSSAF (mandatory) plus the versement libératoire
// (only if opted in). `applicable` is false for anything but a
// micro-entrepreneur: a real company's IS/IR depends on deductible expenses
// this app doesn't track, so guessing would be misleading rather than just
// imprecise (see docs/roadmap.md Phase 17).
export interface EstimatedCharges {
  applicable: boolean;
  versementLiberatoireOptIn: boolean;
  rows: EstimatedChargesCategoryRow[];
  uncategorizedExclVatCents: number;
  cotisationsSocialesCents: number;
  versementLiberatoireCents: number;
  totalEstimatedCents: number;
}

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
  month: string;
  totalExclVatCents: number;
}

export interface TopEntry {
  label: string;
  totalCents: number;
  count: number;
}

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
  // Phase 1.1-1: every FACTURE (any status but ANNULEE) with no signature
  // proof and no manual fallback checked — not scoped to the 12-month
  // window, same "whole book" treatment as outstandingTotalCents.
  unsignedFactureCount: number;
}

// Phase 1.3-6 (2026 e-invoicing reform, workflow automation): a compliance
// snapshot, deliberately separate from ActivityAnalytics above — see
// StatsReportsPage's own comment for why it renders outside the
// analyticsLocked() gate.
export interface EInvoicingSnapshot {
  configured: boolean;
  connected: boolean;
  facturesInWindow: number;
  transmittedFacturesInWindow: number;
  // Null, not 0, when there's nothing in the window to divide by.
  transmissionRatePercent: number | null;
  // Deliberately NOT windowed — same "whole book" treatment as
  // unsignedFactureCount above.
  unsentFactureCount: number;
  receivedInvoiceCount: number;
}
