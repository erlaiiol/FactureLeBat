import { PdfService } from './pdf.service';
import { InvoicePdfData } from './invoice-pdf-data.interface';

function samplePdfData(): InvoicePdfData {
  return {
    number: 'F-000001',
    date: new Date('2026-01-15'),
    issuerName: 'Parquets Raillere',
    issuerAddressLine1: '1 rue des Artisans',
    issuerAddressLine2: null,
    issuerPostalCode: '69001',
    issuerCity: 'Lyon',
    issuerSiret: '12345678900012',
    issuerEmail: null,
    issuerPhone: null,
    customerName: 'M. Dupont',
    customerAddress: null,
    customerEmail: null,
    customerPhone: null,
    lines: [
      {
        description: 'Parquet',
        unit: 'm2',
        quantity: '10',
        unitPriceCents: 4500,
        totalCents: 45000,
      },
    ],
    serviceLines: [],
    vatApplicable: false,
    vatRateBasisPoints: 2000,
    subtotalExclVatCents: 45000,
    vatAmountCents: 0,
    totalInclVatCents: 45000,
  };
}

describe('PdfService', () => {
  it('generates a non-empty PDF buffer for a valid invoice data object', async () => {
    const service = new PdfService();
    const buffer = await service.generateInvoicePdf(samplePdfData());

    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('generates a non-empty PDF buffer when a VISIBLE service line is present', async () => {
    const service = new PdfService();
    const data = {
      ...samplePdfData(),
      serviceLines: [{ name: "Main-d'œuvre", amountCents: 10000 }],
    };
    const buffer = await service.generateInvoicePdf(data);

    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });
});
