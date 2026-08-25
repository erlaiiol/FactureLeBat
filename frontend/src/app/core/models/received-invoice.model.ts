// Phase 1.2-5 (2026 e-invoicing reform): a supplier invoice received
// through the connected PA — mirrors backend's ReceivedInvoice exactly.
// Every field but `id`/`receivedAt` is nullable: a supplier's own invoice
// could in principle be missing any of these depending on their own
// compliance, and this app has no way to demand a resend.
export interface ReceivedInvoice {
  id: string;
  issuerName: string | null;
  issuerSiret: string | null;
  number: string | null;
  issueDate: string | null;
  totalInclVatCents: number | null;
  vatAmountCents: number | null;
  currencyCode: string | null;
  receivedAt: string;
}
