import { SuperPdpIncomingInvoice } from '../invoice/e-invoicing/super-pdp-client.service';
import { UpsertReceivedInvoiceData } from './received-invoice.repository';

// SUPER PDP returns monetary amounts as decimal strings (e.g. "450.00", per
// its OpenAPI spec's `format: decimal`) — parsed via string manipulation,
// not `Number(value) * 100`, to avoid float rounding on values that could
// have more than 2 decimal digits in the wire format.
export function parseDecimalToCents(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [wholePart, fractionalPart = ''] = unsigned.split('.');
  const cents = Number(wholePart) * 100 + Number(fractionalPart.padEnd(2, '0').slice(0, 2));
  if (!Number.isFinite(cents)) {
    return null;
  }
  return negative ? -cents : cents;
}

function parseIssueDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Narrows SUPER PDP's full EN16931 `en_invoice` structure down to the small,
// deliberately minimal set of fields this app's reception inbox stores —
// see ReceivedInvoice's own schema.prisma comment for why this stays an
// island rather than growing into a full EN16931 mirror.
export function toReceivedInvoiceData(invoice: SuperPdpIncomingInvoice): UpsertReceivedInvoiceData {
  const enInvoice = invoice.en_invoice;
  return {
    superPdpInvoiceId: String(invoice.id),
    issuerName: enInvoice?.seller?.name ?? null,
    issuerSiret: enInvoice?.seller?.legal_registration_identifier?.value ?? null,
    number: enInvoice?.number ?? null,
    issueDate: parseIssueDate(enInvoice?.issue_date),
    totalInclVatCents: parseDecimalToCents(enInvoice?.totals?.total_with_vat),
    vatAmountCents: parseDecimalToCents(enInvoice?.totals?.total_vat_amount),
    currencyCode: enInvoice?.currency_code ?? null,
  };
}
