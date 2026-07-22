import { InvoiceCalculationService } from './calculation/invoice-calculation.service';
import { InvoiceMapper } from './invoice.mapper';
import { InvoiceWithLines } from './invoice.repository';

function invoiceWithLines(overrides: Partial<InvoiceWithLines> = {}): InvoiceWithLines {
  return {
    id: 'inv-1',
    number: 'F-000001',
    date: new Date('2026-01-15'),
    customerName: 'M. Dupont',
    customerAddress: null,
    customerEmail: null,
    customerPhone: null,
    customerId: null,
    companyId: 'company-1',
    vatApplicable: true,
    vatRateBasisPoints: 2000,
    createdAt: new Date('2026-01-15'),
    updatedAt: new Date('2026-01-15'),
    lines: [
      {
        id: 'line-1',
        invoiceId: 'inv-1',
        position: 0,
        description: 'Parquet',
        unit: 'm2',
        mode: 'AREA',
        quantity: '10' as unknown as InvoiceWithLines['lines'][number]['quantity'],
        unitPriceCents: 4500,
        wasteSurcharge: 'NONE',
        createdAt: new Date('2026-01-15'),
      },
    ],
    company: {
      id: 'company-1',
      name: 'Parquets Raillere',
      siret: '12345678900012',
      addressLine1: '1 rue des Artisans',
      addressLine2: null,
      postalCode: '69001',
      city: 'Lyon',
      email: null,
      phone: null,
      legalStatus: 'COMPANY',
      vatRateBasisPoints: 2000,
      invoiceNumberPrefix: 'F',
      nextInvoiceNumber: 2,
      createdAt: new Date('2026-01-15'),
      updatedAt: new Date('2026-01-15'),
    },
    ...overrides,
  };
}

describe('InvoiceMapper', () => {
  const mapper = new InvoiceMapper(new InvoiceCalculationService());

  describe('toInvoiceWithTotals', () => {
    it('sums the mapped line totals into the invoice subtotal', () => {
      const result = mapper.toInvoiceWithTotals(invoiceWithLines());
      expect(result.lines[0].lineTotalExclVatCents).toBe(45000);
      expect(result.subtotalExclVatCents).toBe(45000);
    });

    it('computes VAT and total from the subtotal when VAT is applicable', () => {
      const result = mapper.toInvoiceWithTotals(invoiceWithLines());
      expect(result.vatAmountCents).toBe(9000);
      expect(result.totalInclVatCents).toBe(54000);
    });
  });

  describe('toPdfData', () => {
    it('carries the issuer identity from the invoice company relation', () => {
      const result = mapper.toPdfData(invoiceWithLines());
      expect(result.issuerName).toBe('Parquets Raillere');
      expect(result.issuerSiret).toBe('12345678900012');
    });

    it('reuses the same totals as toInvoiceWithTotals', () => {
      const invoice = invoiceWithLines();
      const withTotals = mapper.toInvoiceWithTotals(invoice);
      const pdfData = mapper.toPdfData(invoice);
      expect(pdfData.totalInclVatCents).toBe(withTotals.totalInclVatCents);
    });
  });
});
