const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
// Same normalization as pdf.service.ts's centsToEuros — fr-FR's narrow
// no-break spaces render as missing-glyph boxes in some mail clients' plain
// text rendering.
const centsToEuros = (cents: number): string =>
  eur.format(cents / 100).replace(/[\u202F\u00A0]/g, ' ');

export interface InvoiceMailTemplateInput {
  companyName: string;
  customerName: string;
  invoiceNumber: string;
  totalInclVatCents: number;
}

export interface InvoiceMailTemplate {
  subject: string;
  text: string;
}

// The roadmap's default template requirement: mentions FactureLeBat so the
// artisan's own client sees where the invoice/tool came from, editable by
// the artisan before sending (see InvoiceMailService/SendInvoiceEmailDto) —
// this function only ever supplies the starting point.
export function buildDefaultInvoiceMailTemplate(
  input: InvoiceMailTemplateInput,
): InvoiceMailTemplate {
  const subject = `${input.companyName} — Facture ${input.invoiceNumber}`;
  const text = [
    `Bonjour ${input.customerName},`,
    '',
    `Veuillez trouver ci-joint la facture ${input.invoiceNumber} d'un montant de ${centsToEuros(input.totalInclVatCents)} TTC.`,
    '',
    'Cordialement,',
    input.companyName,
    '',
    '— Facture envoyée avec FactureLeBat',
  ].join('\n');
  return { subject, text };
}
