// The real French VAT rates relevant to a construction artisan's invoicing —
// no 15% (doesn't exist), 5.5%/10% are the two reduced rates that apply to
// travaux depending on the nature of the job (energy-efficiency renovation
// vs. everything else on housing over 2 years old), 20% is the standard
// rate. 2.1% (press/medicines) is deliberately excluded, it's never
// relevant to this app's audience. Shared by InvoiceTotalsSummaryComponent
// (manual mode's per-document override) and InvoiceCreateShellPage (the
// one-time VAT-regime confirmation prompt) — same three rates, same labels,
// one source of truth.
export const FIXED_VAT_RATE_OPTIONS: readonly { basisPoints: number; label: string }[] = [
  { basisPoints: 550, label: formatRateLabel(550) },
  { basisPoints: 1000, label: formatRateLabel(1000) },
  { basisPoints: 2000, label: formatRateLabel(2000) },
];

export function formatRateLabel(basisPoints: number): string {
  return `${(basisPoints / 100).toString().replace('.', ',')} %`;
}
