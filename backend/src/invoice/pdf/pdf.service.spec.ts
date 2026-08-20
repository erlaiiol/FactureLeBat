import { PdfService } from './pdf.service';
import { InvoicePdfData } from './invoice-pdf-data.interface';

function samplePdfData(): InvoicePdfData {
  return {
    number: 'F-000001',
    documentType: 'FACTURE',
    date: new Date('2026-01-15'),
    issuerName: 'Parquets Raillere',
    issuerAddressLine1: '1 rue des Artisans',
    issuerAddressLine2: null,
    issuerPostalCode: '69001',
    issuerCity: 'Lyon',
    issuerSiret: '12345678900012',
    issuerEmail: null,
    issuerPhone: null,
    companyVatExempt: true,
    issuerLogo: null,
    showWatermark: true,
    decennialInsurance: null,
    customFooterMessage: null,
    earlyPaymentDiscountMention: "Pas d'escompte pour paiement anticipé.",
    vatOnDebitsOption: false,
    signature: null,
    customerIsProfessional: false,
    customerName: 'M. Dupont',
    customerAddress: null,
    customerEmail: null,
    customerPhone: null,
    customerSiret: null,
    deliveryAddress: null,
    customerFields: [],
    entryMode: 'GUIDED',
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
    discountLines: [],
    simplifiedDisplay: false,
    vatApplicable: false,
    vatRateBasisPoints: 2000,
    reverseChargeApplicable: false,
    natureOfOperation: 'LIVRAISON_BIENS',
    subtotalExclVatCents: 45000,
    vatAmountCents: 0,
    totalInclVatCents: 45000,
    dueDate: null,
    depositPercentageBasisPoints: null,
    depositAmountCents: null,
    depositPaidAt: null,
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

  it('generates a non-empty PDF buffer when a discount line is present', async () => {
    const service = new PdfService();
    const data = {
      ...samplePdfData(),
      discountLines: [{ name: 'Remise fidélité', amountCents: 5000 }],
    };
    const buffer = await service.generateInvoicePdf(data);

    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('generates a non-empty PDF buffer for a Phase 9.5 manual-mode invoice', async () => {
    const service = new PdfService();
    const data: InvoicePdfData = {
      ...samplePdfData(),
      entryMode: 'MANUAL',
      lines: [],
      manualTable: {
        columns: [{ label: 'Désignation' }, { label: 'Quantité' }, { label: 'Prix unitaire' }],
        rows: [{ cells: ['Parquet chêne massif', '10', '45.00'], totalCents: 45000 }],
      },
    };
    const buffer = await service.generateInvoicePdf(data);

    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('generates a non-empty PDF buffer with just Description/Total columns when simplifiedDisplay is set', async () => {
    const service = new PdfService();
    const data = { ...samplePdfData(), simplifiedDisplay: true };
    const buffer = await service.generateInvoicePdf(data);

    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('generates a non-empty PDF buffer with the decennial insurance mention when set', async () => {
    const service = new PdfService();
    const data: InvoicePdfData = {
      ...samplePdfData(),
      decennialInsurance: {
        insurerName: 'MAAF Assurances',
        policyNumber: '123456789',
        coverageArea: 'France métropolitaine',
      },
    };
    const buffer = await service.generateInvoicePdf(data);

    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('generates a non-empty PDF buffer with the custom footer mention when set (Phase 1.1-6)', async () => {
    const service = new PdfService();
    const data: InvoicePdfData = {
      ...samplePdfData(),
      customFooterMessage: 'Devis gratuit, valable 30 jours.',
    };
    const buffer = await service.generateInvoicePdf(data);

    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('generates a non-empty PDF buffer with the Art. L441-9 mentions for a professional-client FACTURE (Phase 1.1-7)', async () => {
    const service = new PdfService();
    const data: InvoicePdfData = {
      ...samplePdfData(),
      documentType: 'FACTURE',
      customerIsProfessional: true,
      dueDate: new Date('2026-03-01'),
      earlyPaymentDiscountMention: "Pas d'escompte pour paiement anticipé.",
    };
    const buffer = await service.generateInvoicePdf(data);

    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('generates a non-empty PDF buffer with the autoliquidation citation when reverseChargeApplicable is set (Phase 1.1-7)', async () => {
    const service = new PdfService();
    const data: InvoicePdfData = {
      ...samplePdfData(),
      vatApplicable: false,
      reverseChargeApplicable: true,
    };
    const buffer = await service.generateInvoicePdf(data);

    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('generates a non-empty PDF buffer with the SIREN and a differing delivery address (Phase 1.1-8)', async () => {
    const service = new PdfService();
    const data: InvoicePdfData = {
      ...samplePdfData(),
      customerAddress: '5 avenue des Clients, 69002 Lyon',
      customerSiret: '12345678900012',
      deliveryAddress: '9 rue du Chantier, 69003 Lyon',
    };
    const buffer = await service.generateInvoicePdf(data);

    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('generates a non-empty PDF buffer with the vatOnDebitsOption mention on a FACTURE (Phase 1.1-8)', async () => {
    const service = new PdfService();
    const data: InvoicePdfData = {
      ...samplePdfData(),
      documentType: 'FACTURE',
      vatOnDebitsOption: true,
    };
    const buffer = await service.generateInvoicePdf(data);

    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('generates a non-empty PDF buffer for each natureOfOperation value (Phase 1.1-8)', async () => {
    const service = new PdfService();
    for (const natureOfOperation of [
      'LIVRAISON_BIENS',
      'PRESTATION_SERVICES',
      'BIENS_ET_SERVICES',
    ] as const) {
      const buffer = await service.generateInvoicePdf({ ...samplePdfData(), natureOfOperation });
      expect(buffer.length).toBeGreaterThan(0);
      expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
    }
  });

  // A real, minimal 1x1 transparent PNG — pdfMake actually decodes this
  // (unlike the other fixtures above, which never touch the image path).
  const TINY_PNG_BASE64 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

  it('generates a non-empty PDF buffer with the signature block when one is attached (Phase 1.1-1)', async () => {
    const service = new PdfService();
    const data: InvoicePdfData = {
      ...samplePdfData(),
      signature: { base64: TINY_PNG_BASE64, mimeType: 'image/png' },
    };
    const buffer = await service.generateInvoicePdf(data);

    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('retries without the signature (and issuer logo) if pdfMake fails to decode either image, rather than throwing', async () => {
    const service = new PdfService();
    const data: InvoicePdfData = {
      ...samplePdfData(),
      issuerLogo: { base64: 'data:image/png;base64,not-a-real-image', mimeType: 'image/png' },
      signature: { base64: 'data:image/png;base64,not-a-real-image', mimeType: 'image/png' },
    };
    const buffer = await service.generateInvoicePdf(data);

    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });
});
