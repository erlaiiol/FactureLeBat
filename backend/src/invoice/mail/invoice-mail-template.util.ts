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
  // Phase 14.3: a devis is mechanically a facture — see DocumentType
  // (schema.prisma). Only the label below changes.
  documentType: 'DEVIS' | 'FACTURE';
  // Company.invoiceMailCustomMessage — the artisan's own note, added as an
  // extra paragraph when set. Null/undefined leaves the template unchanged.
  customMessage?: string | null;
  // Phase 1.3-7 ("Partager"): the token-based public link, when the caller
  // already has one — see InvoiceMailService. Appended as its own line so
  // the recipient can reopen/redownload the document later without asking
  // for it again, not just the one-time attachment this text ships beside.
  shareUrl?: string | null;
}

export interface InvoiceMailTemplate {
  subject: string;
  text: string;
}

// The roadmap's default template requirement: mentions FactureLe so the
// artisan's own client sees where the invoice/tool came from, editable by
// the artisan before sending (see InvoiceMailService/SendInvoiceEmailDto) —
// this function only ever supplies the starting point.
export function buildDefaultInvoiceMailTemplate(
  input: InvoiceMailTemplateInput,
): InvoiceMailTemplate {
  const label = input.documentType === 'DEVIS' ? 'Devis' : 'Facture';
  const lowerLabel = input.documentType === 'DEVIS' ? 'devis' : 'facture';
  const subject = `${input.companyName} — ${label} ${input.invoiceNumber}`;
  const text = [
    `Bonjour ${input.customerName},`,
    '',
    `Veuillez trouver ci-joint ${input.documentType === 'DEVIS' ? 'le' : 'la'} ${lowerLabel} ${input.invoiceNumber} d'un montant de ${centsToEuros(input.totalInclVatCents)} TTC.`,
    ...(input.customMessage ? ['', input.customMessage] : []),
    ...(input.shareUrl ? ['', `Voir ${lowerLabel} en ligne : ${input.shareUrl}`] : []),
    '',
    'Cordialement,',
    input.companyName,
    '',
    `— ${label} envoyé${input.documentType === 'DEVIS' ? '' : 'e'} avec FactureLe`,
  ].join('\n');
  return { subject, text };
}
