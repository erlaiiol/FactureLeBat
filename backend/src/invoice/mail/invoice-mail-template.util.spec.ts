import { buildDefaultInvoiceMailTemplate } from './invoice-mail-template.util';

describe('buildDefaultInvoiceMailTemplate', () => {
  it('mentions FactureLeBat in the body (product visibility requirement)', () => {
    const { text } = buildDefaultInvoiceMailTemplate({
      companyName: 'Parquet Dupont',
      customerName: 'Mme Martin',
      invoiceNumber: 'F-000012',
      totalInclVatCents: 123456,
      documentType: 'FACTURE',
    });
    expect(text).toContain('FactureLeBat');
  });

  it('includes the invoice number and formatted total in French currency style', () => {
    const { subject, text } = buildDefaultInvoiceMailTemplate({
      companyName: 'Parquet Dupont',
      customerName: 'Mme Martin',
      invoiceNumber: 'F-000012',
      totalInclVatCents: 123456,
      documentType: 'FACTURE',
    });
    expect(subject).toContain('F-000012');
    expect(text).toContain('F-000012');
    expect(text).toContain('1 234,56');
  });

  it('addresses the customer by name', () => {
    const { text } = buildDefaultInvoiceMailTemplate({
      companyName: 'Parquet Dupont',
      customerName: 'Mme Martin',
      invoiceNumber: 'F-000012',
      totalInclVatCents: 123456,
      documentType: 'FACTURE',
    });
    expect(text).toContain('Mme Martin');
  });
});
