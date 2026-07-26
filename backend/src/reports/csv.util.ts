import { QuarterlyReport } from './entities/report.entity';
import { CATEGORY_LABELS } from './activity-category.util';

// Semicolon delimiter + comma decimal separator: how Excel (fr-FR locale,
// the artisan's own accountant's default) actually opens a CSV — a plain
// comma-delimited/dot-decimal file opens as one unreadable column instead.
const EUR = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const centsToEuros = (cents: number): string => EUR.format(cents / 100);

function escapeCsvField(value: string): string {
  return /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function row(fields: string[]): string {
  return fields.map(escapeCsvField).join(';');
}

// Reuses PdfService's report data — one file, two sections: the category
// breakdown (the number the artisan actually declares) followed by the full
// audit trail of paid invoices it's built from, so an accountant handed
// just this CSV can still cross-check the total. UTF-8 BOM so Excel doesn't
// mis-decode the é/È characters in French labels/client names.
export function buildQuarterlyReportCsv(report: QuarterlyReport): string {
  const lines: string[] = [
    row(['Rapport trimestriel']),
    row(['Période', `${report.from} au ${report.to}`]),
    row(['Total encaissé HT', centsToEuros(report.totalExclVatCents)]),
    '',
    row(['Répartition par catégorie', 'Montant HT']),
    ...report.byCategory.map((entry) =>
      row([CATEGORY_LABELS[entry.category], centsToEuros(entry.totalExclVatCents)]),
    ),
    '',
    ...buildEstimatedChargesRows(report),
    row(['Détail des factures encaissées']),
    row(['Numéro', 'Client', "Date d'encaissement", 'Montant TTC']),
    ...report.invoices.map((invoice) =>
      row([
        invoice.number,
        invoice.customerName,
        invoice.paidAt.toLocaleDateString('fr-FR'),
        centsToEuros(invoice.totalInclVatCents),
      ]),
    ),
  ];

  return '﻿' + lines.join('\r\n');
}

// Estimate only, always labelled as such — see EstimatedCharges' own
// comment for why this is omitted entirely (rather than shown as zero) for
// anything but a micro-entrepreneur.
function buildEstimatedChargesRows(report: QuarterlyReport): string[] {
  const charges = report.estimatedCharges;
  if (!charges.applicable) {
    return [
      row(['Estimation des charges (cotisations sociales)']),
      row([
        "Non disponible pour ce statut — l'impôt d'une société dépend de ses charges réelles, à calculer avec votre expert-comptable.",
      ]),
      '',
    ];
  }

  const rows = [
    row(['Estimation des charges (cotisations sociales, à titre indicatif)']),
    row(['Catégorie', 'Montant HT', 'Taux cotisation', 'Cotisation estimée']),
    ...charges.rows.map((entry) =>
      row([
        CATEGORY_LABELS[entry.category],
        centsToEuros(entry.totalExclVatCents),
        `${(entry.cotisationRateBasisPoints / 100).toFixed(2)} %`,
        centsToEuros(entry.cotisationCents),
      ]),
    ),
    row(['Total cotisations sociales estimées', centsToEuros(charges.cotisationsSocialesCents)]),
  ];

  if (charges.versementLiberatoireOptIn) {
    rows.push(
      row(['Versement libératoire estimé', centsToEuros(charges.versementLiberatoireCents)]),
    );
  }

  rows.push(row(['Total estimé (charges + impôt)', centsToEuros(charges.totalEstimatedCents)]));

  if (charges.uncategorizedExclVatCents > 0) {
    rows.push(
      row([
        'Dont non catégorisé, exclu de cette estimation',
        centsToEuros(charges.uncategorizedExclVatCents),
      ]),
    );
  }

  rows.push('');
  return rows;
}
