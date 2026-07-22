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
    serviceLines: [],
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

    it('adds a VISIBLE service line amount to the subtotal without touching any line total', () => {
      const invoice = invoiceWithLines({
        serviceLines: [
          {
            id: 'svc-1',
            invoiceId: 'inv-1',
            position: 0,
            serviceId: null,
            name: "Main-d'œuvre",
            description: null,
            amountCents: 10000,
            visibility: 'VISIBLE',
            createdAt: new Date('2026-01-15'),
            weights: [],
          },
        ],
      });
      const result = mapper.toInvoiceWithTotals(invoice);

      expect(result.lines[0].lineTotalExclVatCents).toBe(45000);
      expect(result.serviceLines).toEqual([
        expect.objectContaining({
          name: "Main-d'œuvre",
          amountCents: 10000,
          visibility: 'VISIBLE',
        }),
      ]);
      // Invoice total increases by exactly the service amount added.
      expect(result.subtotalExclVatCents).toBe(45000 + 10000);
    });

    it('folds a REDISTRIBUTED service line into the referenced lines, matching the total increase invariant', () => {
      const invoice = invoiceWithLines({
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
          {
            id: 'line-2',
            invoiceId: 'inv-1',
            position: 1,
            description: 'Plinthes',
            unit: 'unite',
            mode: 'UNIT',
            quantity: '5' as unknown as InvoiceWithLines['lines'][number]['quantity'],
            unitPriceCents: 800,
            wasteSurcharge: 'NONE',
            createdAt: new Date('2026-01-15'),
          },
        ],
        serviceLines: [
          {
            id: 'svc-1',
            invoiceId: 'inv-1',
            position: 0,
            serviceId: null,
            name: 'Savoir-faire',
            description: null,
            amountCents: 10000,
            visibility: 'REDISTRIBUTED',
            createdAt: new Date('2026-01-15'),
            weights: [
              { id: 'w-1', invoiceServiceLineId: 'svc-1', invoiceLineId: 'line-1', weight: 1 },
              { id: 'w-2', invoiceServiceLineId: 'svc-1', invoiceLineId: 'line-2', weight: 1 },
            ],
          },
        ],
      });

      const result = mapper.toInvoiceWithTotals(invoice);
      const baseSubtotal = 45000 + 4000; // 10*4500 + 5*800
      // Base line totals plus their share of the redistributed 10000 cents.
      expect(result.lines[0].lineTotalExclVatCents + result.lines[1].lineTotalExclVatCents).toBe(
        baseSubtotal + 10000,
      );
      // No service line total is shown on its own for a REDISTRIBUTED line...
      expect(result.serviceLines[0].amountCents).toBe(10000);
      // ...but the breakdown is exposed for transparency, and sums back exactly.
      const distributed = result.serviceLines[0].distribution!.reduce(
        (sum, entry) => sum + entry.amountCents,
        0,
      );
      expect(distributed).toBe(10000);
      // The invoice total increases by exactly the service amount, same
      // invariant as the VISIBLE case above.
      expect(result.subtotalExclVatCents).toBe(baseSubtotal + 10000);
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
