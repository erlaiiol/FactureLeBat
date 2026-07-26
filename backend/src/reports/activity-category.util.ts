import { ActivityCategory } from '../../generated/prisma/enums';
import { ReportCategory, UNCATEGORIZED } from './entities/report.entity';

// French labels for the report's category breakdown (CSV/PDF) — same
// "backend renders the label, frontend mirrors its own copy for the JSON
// API's raw enum" split as unit.util.ts's UNIT_LABELS (see docs/roadmap.md
// Phase 7's implementation notes).
export const CATEGORY_LABELS: Record<ReportCategory, string> = {
  VENTE_MARCHANDISES: 'Vente de marchandises',
  PRESTATION_BIC: 'Prestation de services (BIC)',
  PRESTATION_BNC: 'Prestation de services (BNC)',
  [UNCATEGORIZED]: 'Non catégorisé',
};

// Fixed display order for the report's category breakdown — not enum
// declaration order, so "non catégorisé" always trails the three real
// categories regardless of how many invoices fall into it.
export const REPORT_CATEGORY_ORDER: ReportCategory[] = [
  'VENTE_MARCHANDISES',
  'PRESTATION_BIC',
  'PRESTATION_BNC',
  UNCATEGORIZED,
];

export function resolveReportCategory(category: ActivityCategory | null): ReportCategory {
  return category ?? UNCATEGORIZED;
}

// Phase 17 (charges estimate): the "versement libératoire de l'impôt sur le
// revenu" rates — fixed by law, with no per-profession/Cipav variation
// (unlike the cotisation rates on Company, which the artisan can edit for
// exactly that reason — see schema.prisma's comment on
// Company.cotisationVenteBasisPoints). Basis points, same convention as
// everywhere else in this app (100 = 1.00%).
export const VERSEMENT_LIBERATOIRE_RATE_BASIS_POINTS: Record<ActivityCategory, number> = {
  VENTE_MARCHANDISES: 100, // 1%
  PRESTATION_BIC: 170, // 1.7%
  PRESTATION_BNC: 220, // 2.2%
};
