import { PdfService } from '../pdf/pdf.service';
import { InvoicePdfData } from '../pdf/invoice-pdf-data.interface';
import { FacturXService } from './facturx.service';

// Every test here runs the real pdfmake + Factur-X hybrid PDF/A-3
// generation pipeline (font embedding, XML embedding, no mocks) —
// deliberately, since a mocked pipeline couldn't catch a real malformed
// hybrid PDF. That real work occasionally exceeds jest's 5s default under
// CPU contention (parallel workers, a loaded dev machine) even though any
// single run in isolation is comfortably faster — bumped instead of
// mocking away the thing these tests exist to catch.
jest.setTimeout(20_000);

function sampleFactureData(overrides: Partial<InvoicePdfData> = {}): InvoicePdfData {
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
    issuerVatNumber: 'FRAB123456789',
    issuerEmail: null,
    issuerPhone: null,
    companyVatExempt: false,
    issuerLogo: null,
    showWatermark: true,
    decennialInsurance: null,
    customFooterMessage: null,
    earlyPaymentDiscountMention: "Pas d'escompte pour paiement anticipé.",
    vatOnDebitsOption: false,
    signature: null,
    customerIsProfessional: false,
    customerName: 'M. Dupont',
    customerAddress: '2 rue des Clients, 69002 Lyon',
    customerEmail: null,
    customerPhone: null,
    customerSiret: null,
    deliveryAddress: null,
    customerFields: [],
    entryMode: 'GUIDED',
    lines: [
      {
        description: 'Parquet chêne massif',
        unit: 'm²',
        unitCode: 'MTK',
        quantity: '10',
        unitPriceCents: 4500,
        totalCents: 45000,
      },
    ],
    serviceLines: [{ name: 'Pose', amountCents: 20000 }],
    discountLines: [],
    simplifiedDisplay: 'NONE',
    vatApplicable: true,
    vatRateBasisPoints: 2000,
    subtotalExclVatCents: 65000,
    vatAmountCents: 13000,
    totalInclVatCents: 78000,
    reverseChargeApplicable: false,
    natureOfOperation: 'BIENS_ET_SERVICES',
    dueDate: new Date('2026-02-15'),
    depositPercentageBasisPoints: null,
    depositAmountCents: null,
    depositPaidAt: null,
    ...overrides,
  };
}

describe('FacturXService', () => {
  const pdfService = new PdfService();
  const facturXService = new FacturXService();

  it('generates a valid Factur-X (BASIC profile) hybrid PDF for a standard GUIDED FACTURE', async () => {
    const data = sampleFactureData();
    const pdfBuffer = await pdfService.generateInvoicePdf(data);

    const hybrid = await facturXService.generateHybridPdf(pdfBuffer, data);

    expect(hybrid.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(hybrid.length).toBeGreaterThan(pdfBuffer.length);
  });

  it('generates a valid hybrid PDF for a franchise-en-base company (no VAT number, VAT not applicable)', async () => {
    const data = sampleFactureData({
      issuerVatNumber: null,
      companyVatExempt: true,
      vatApplicable: false,
      vatAmountCents: 0,
      totalInclVatCents: 65000,
    });
    const pdfBuffer = await pdfService.generateInvoicePdf(data);

    const hybrid = await facturXService.generateHybridPdf(pdfBuffer, data);

    expect(hybrid.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('generates a valid hybrid PDF for an autoliquidation (reverse charge) invoice', async () => {
    const data = sampleFactureData({
      vatApplicable: false,
      reverseChargeApplicable: true,
      vatAmountCents: 0,
      totalInclVatCents: 65000,
      // BR-AE-02 requires the buyer to be identifiable (VAT id or legal
      // registration id) on a reverse-charge invoice — realistic for this
      // scenario since Phase 1.1-7 reverse charge only applies to
      // professional/intra-EU clients, who'd have this on file.
      customerSiret: '98765432100099',
    });
    const pdfBuffer = await pdfService.generateInvoicePdf(data);

    const hybrid = await facturXService.generateHybridPdf(pdfBuffer, data);

    expect(hybrid.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('generates a valid hybrid PDF for a MANUAL-mode invoice (degenerate line-per-row mapping)', async () => {
    const data = sampleFactureData({
      entryMode: 'MANUAL',
      lines: [],
      serviceLines: [],
      manualTable: {
        columns: [{ label: 'Description' }, { label: 'Montant' }],
        rows: [{ cells: ['Fourniture et pose', '650,00 €'], totalCents: 65000 }],
      },
    });
    const pdfBuffer = await pdfService.generateInvoicePdf(data);

    const hybrid = await facturXService.generateHybridPdf(pdfBuffer, data);

    expect(hybrid.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  // Regression (found 2026-08-23): unitCode must stay MTK even when the
  // artisan's purely-cosmetic showUnitDetail toggle blanks InvoicePdfLine's
  // display `unit` to '' — the two must never be conflated (see
  // InvoicePdfLine.unitCode's own comment).
  it('embeds the real UN/ECE unit code even when the display unit is blanked (showUnitDetail off)', async () => {
    const data = sampleFactureData({
      lines: [
        {
          description: 'Parquet chêne massif',
          unit: '', // blanked, as InvoiceMapper does when showUnitDetail is false
          unitCode: 'MTK',
          quantity: '10',
          unitPriceCents: 4500,
          totalCents: 45000,
        },
      ],
      // Isolate the product line's unitCode from the service line's own
      // (legitimately always-C62) unitCode below — totals adjusted to match
      // the single remaining 45000-cent line (20% VAT).
      serviceLines: [],
      subtotalExclVatCents: 45000,
      vatAmountCents: 9000,
      totalInclVatCents: 54000,
    });
    const pdfBuffer = await pdfService.generateInvoicePdf(data);
    const hybrid = await facturXService.generateHybridPdf(pdfBuffer, data);

    const { extract } = await import('@stafyniaksacha/facturx');
    const { xml } = await extract({ pdf: hybrid });
    expect(xml).toContain('unitCode="MTK"');
    expect(xml).not.toContain('unitCode="C62"');
  });

  // Regression (found 2026-08-23): a VAT-registered (non-franchise) company
  // using a MANUAL invoice's vatApplicableOverride must not get the
  // franchise-en-base legal citation, matching PdfService.buildFooter's own
  // three-way branch.
  it('omits the art. 293 B citation for a VAT-liable company using vatApplicableOverride', async () => {
    const data = sampleFactureData({
      companyVatExempt: false, // the company itself is fully VAT-liable
      vatApplicable: false, // this one MANUAL document overrides VAT off
      vatAmountCents: 0,
      totalInclVatCents: 65000,
    });
    const pdfBuffer = await pdfService.generateInvoicePdf(data);
    const hybrid = await facturXService.generateHybridPdf(pdfBuffer, data);

    const { extract } = await import('@stafyniaksacha/facturx');
    const { xml } = await extract({ pdf: hybrid });
    expect(xml).not.toContain('293 B');
    expect(xml).toContain('TVA non applicable');
  });
});
