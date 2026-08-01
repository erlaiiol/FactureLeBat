import { CompanyModel } from '../../generated/prisma/models';
import { InvoiceCalculationService } from './calculation/invoice-calculation.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreateInvoiceLineDto } from './dto/create-invoice-line.dto';
import { RedistributionStrategy } from './dto/redistribution-strategy.enum';
import { InvoiceMapper } from './invoice.mapper';
import { InvoiceWithLines } from './invoice.repository';

function companyFixture(overrides: Partial<CompanyModel> = {}): CompanyModel {
  return {
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
    devisNumberPrefix: 'DEV',
    tourEnabled: true,
    completedTours: [],
    smtpHost: null,
    smtpPort: null,
    smtpSecure: true,
    smtpUser: null,
    smtpPasswordEncrypted: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionStatus: 'NONE',
    subscriptionPlanTier: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    premiumGrantedUntil: null,
    grantedPlanTier: null,
    referralCode: 'REFCODE1',
    pendingReferralDiscount: false,
    declarationFrequency: 'TRIMESTRIELLE',
    microEntrepreneurCeiling: null,
    cotisationVenteBasisPoints: 1230,
    cotisationPrestationBicBasisPoints: 2120,
    cotisationPrestationBncBasisPoints: 2110,
    versementLiberatoireOptIn: false,
    createdAt: new Date('2026-01-15'),
    updatedAt: new Date('2026-01-15'),
    ...overrides,
  };
}

function createInvoiceDtoFixture(overrides: Partial<CreateInvoiceDto> = {}): CreateInvoiceDto {
  return {
    customerName: 'M. Dupont',
    lines: [
      {
        description: 'Parquet',
        unit: 'SQUARE_METER',
        quantity: 10,
        unitPriceCents: 4500,
        wasteSurcharge: 'NONE',
      },
    ],
    ...overrides,
  };
}

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
    subtotalOverrideCents: null,
    vatOverrideCents: null,
    totalOverrideCents: null,
    sentAt: null,
    sentToEmail: null,
    status: 'NON_PAYEE',
    dueDate: null,
    paidAt: null,
    lastReminderAt: null,
    lastPushReminderAt: null,
    createdAt: new Date('2026-01-15'),
    updatedAt: new Date('2026-01-15'),
    entryMode: 'GUIDED',
    documentType: 'FACTURE',
    convertedFromDevisId: null,
    convertedToFacture: null,
    simplifiedDisplay: false,
    lines: [
      {
        id: 'line-1',
        invoiceId: 'inv-1',
        position: 0,
        description: 'Parquet',
        unit: 'SQUARE_METER',
        quantity: '10' as unknown as InvoiceWithLines['lines'][number]['quantity'],
        unitPriceCents: 4500,
        wasteSurcharge: 'NONE',
        packagingQuantity: null,
        roundUpToPackaging: true,
        productCode: null,
        showUnitDetail: true,
        showBillingDetail: true,
        activityCategory: null,
        createdAt: new Date('2026-01-15'),
      },
    ],
    serviceLines: [],
    manualColumns: [],
    manualRows: [],
    customerFields: [],
    company: companyFixture(),
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

    it('exposes the billed (post-packaging-rounding) quantity and prices off it, not the raw site quantity', () => {
      const invoice = invoiceWithLines({
        lines: [
          {
            id: 'line-1',
            invoiceId: 'inv-1',
            position: 0,
            description: 'Parquet',
            unit: 'SQUARE_METER',
            quantity: '23' as unknown as InvoiceWithLines['lines'][number]['quantity'],
            unitPriceCents: 4500,
            wasteSurcharge: 'NONE',
            packagingQuantity: '9' as unknown as InvoiceWithLines['lines'][number]['quantity'],
            roundUpToPackaging: true,
            productCode: null,
            showUnitDetail: true,
            showBillingDetail: true,
            activityCategory: null,
            createdAt: new Date('2026-01-15'),
          },
        ],
      });
      const result = mapper.toInvoiceWithTotals(invoice);

      expect(result.lines[0].quantity).toBe('23');
      expect(result.lines[0].billedQuantity).toBe('27');
      expect(result.lines[0].lineTotalExclVatCents).toBe(27 * 4500);
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
            activityCategory: null,
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
            unit: 'SQUARE_METER',
            quantity: '10' as unknown as InvoiceWithLines['lines'][number]['quantity'],
            unitPriceCents: 4500,
            wasteSurcharge: 'NONE',
            packagingQuantity: null,
            roundUpToPackaging: true,
            productCode: null,
            showUnitDetail: true,
            showBillingDetail: true,
            activityCategory: null,
            createdAt: new Date('2026-01-15'),
          },
          {
            id: 'line-2',
            invoiceId: 'inv-1',
            position: 1,
            description: 'Plinthes',
            unit: 'UNIT',
            quantity: '5' as unknown as InvoiceWithLines['lines'][number]['quantity'],
            unitPriceCents: 800,
            wasteSurcharge: 'NONE',
            packagingQuantity: null,
            roundUpToPackaging: true,
            productCode: null,
            showUnitDetail: true,
            showBillingDetail: true,
            activityCategory: null,
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
            activityCategory: null,
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

    it('recomputes the displayed unit price when a REDISTRIBUTED+hidden service line inflates a line total, so unitPrice x quantity keeps matching the printed line total', () => {
      // Exact repro of the reported bug: "salzer" at 4€/m² x 25 (=100€), plus
      // a "marge 30%" service redistributed invisibly onto that single line
      // (+30€). The line total correctly becomes 130€, but before this fix
      // the printed unit price stayed at 4,00€ (4 x 25 = 100 ≠ 130).
      const invoice = invoiceWithLines({
        lines: [
          {
            id: 'line-1',
            invoiceId: 'inv-1',
            position: 0,
            description: 'Salzer',
            unit: 'SQUARE_METER',
            quantity: '25' as unknown as InvoiceWithLines['lines'][number]['quantity'],
            unitPriceCents: 400,
            wasteSurcharge: 'NONE',
            packagingQuantity: null,
            roundUpToPackaging: true,
            productCode: null,
            showUnitDetail: true,
            showBillingDetail: true,
            activityCategory: null,
            createdAt: new Date('2026-01-15'),
          },
        ],
        serviceLines: [
          {
            id: 'svc-1',
            invoiceId: 'inv-1',
            position: 0,
            serviceId: null,
            name: 'Marge 30%',
            description: null,
            amountCents: 3000,
            visibility: 'REDISTRIBUTED',
            activityCategory: null,
            createdAt: new Date('2026-01-15'),
            weights: [
              { id: 'w-1', invoiceServiceLineId: 'svc-1', invoiceLineId: 'line-1', weight: 1 },
            ],
          },
        ],
      });

      const result = mapper.toInvoiceWithTotals(invoice);

      expect(result.lines[0].unitPriceCents).toBe(400); // raw price, unchanged
      expect(result.lines[0].lineTotalExclVatCents).toBe(13000);
      expect(result.lines[0].displayUnitPriceCents).toBe(520); // 4€ x 1.3
      expect(result.lines[0].displayUnitPriceCents * Number(result.lines[0].billedQuantity)).toBe(
        result.lines[0].lineTotalExclVatCents,
      );

      const pdf = mapper.toPdfData(invoice);
      expect(pdf.lines[0].unitPriceCents).toBe(520);
      expect(pdf.lines[0].totalCents).toBe(13000);
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

    it('renders the unit and billed-quantity note by default', () => {
      const invoice = invoiceWithLines({
        lines: [
          {
            id: 'line-1',
            invoiceId: 'inv-1',
            position: 0,
            description: 'Parquet',
            unit: 'SQUARE_METER',
            quantity: '23' as unknown as InvoiceWithLines['lines'][number]['quantity'],
            unitPriceCents: 4500,
            wasteSurcharge: 'NONE',
            packagingQuantity: '9' as unknown as InvoiceWithLines['lines'][number]['quantity'],
            roundUpToPackaging: true,
            productCode: null,
            showUnitDetail: true,
            showBillingDetail: true,
            activityCategory: null,
            createdAt: new Date('2026-01-15'),
          },
        ],
      });
      const result = mapper.toPdfData(invoice);
      expect(result.lines[0].unit).toBe('m²');
      expect(result.lines[0].billedQuantity).toBe('27');
    });

    // Phase 15: hiding a line's technical detail is purely a rendering
    // choice — the priced total (still 27 m² billed, not the raw 23) must
    // stay exactly the same regardless of what's shown.
    it('blanks the unit and omits the billed-quantity note when Phase 15 toggles are off, without changing the priced total', () => {
      const invoice = invoiceWithLines({
        lines: [
          {
            id: 'line-1',
            invoiceId: 'inv-1',
            position: 0,
            description: 'Parquet',
            unit: 'SQUARE_METER',
            quantity: '23' as unknown as InvoiceWithLines['lines'][number]['quantity'],
            unitPriceCents: 4500,
            wasteSurcharge: 'NONE',
            packagingQuantity: '9' as unknown as InvoiceWithLines['lines'][number]['quantity'],
            roundUpToPackaging: true,
            productCode: null,
            showUnitDetail: false,
            showBillingDetail: false,
            activityCategory: null,
            createdAt: new Date('2026-01-15'),
          },
        ],
      });
      const result = mapper.toPdfData(invoice);
      expect(result.lines[0].unit).toBe('');
      expect(result.lines[0].billedQuantity).toBeUndefined();
      expect(result.lines[0].totalCents).toBe(27 * 4500);
    });
  });

  describe('toPreviewPdfData', () => {
    it('computes the same line and VAT totals as the persisted path, for equivalent input', () => {
      const invoice = invoiceWithLines();
      const persisted = mapper.toPdfData(invoice);
      const preview = mapper.toPreviewPdfData(createInvoiceDtoFixture(), companyFixture());

      expect(preview.lines[0].totalCents).toBe(persisted.lines[0].totalCents);
      expect(preview.subtotalExclVatCents).toBe(persisted.subtotalExclVatCents);
      expect(preview.vatAmountCents).toBe(persisted.vatAmountCents);
      expect(preview.totalInclVatCents).toBe(persisted.totalInclVatCents);
    });

    it('never sets a real invoice number, since nothing is persisted', () => {
      const preview = mapper.toPreviewPdfData(createInvoiceDtoFixture(), companyFixture());
      expect(preview.number).toBe('BROUILLON');
    });

    it('takes issuer identity from the passed-in company, not any persisted invoice', () => {
      const preview = mapper.toPreviewPdfData(
        createInvoiceDtoFixture(),
        companyFixture({ name: 'Autre Artisan', siret: '98765432100099' }),
      );
      expect(preview.issuerName).toBe('Autre Artisan');
      expect(preview.issuerSiret).toBe('98765432100099');
    });

    it('excludes VAT for a MICRO_ENTREPRENEUR company', () => {
      const preview = mapper.toPreviewPdfData(
        createInvoiceDtoFixture(),
        companyFixture({ legalStatus: 'MICRO_ENTREPRENEUR' }),
      );
      expect(preview.vatApplicable).toBe(false);
      expect(preview.vatAmountCents).toBe(0);
      expect(preview.totalInclVatCents).toBe(preview.subtotalExclVatCents);
      // A genuine franchise-en-base company — PdfService cites art. 293 B.
      expect(preview.companyVatExempt).toBe(true);
    });

    it("marks a COMPANY (VAT-registered) as not exempt, regardless of this invoice's own vatApplicable", () => {
      const preview = mapper.toPreviewPdfData(
        createInvoiceDtoFixture(),
        companyFixture({ legalStatus: 'COMPANY' }),
      );
      expect(preview.companyVatExempt).toBe(false);
    });

    it('adds a VISIBLE service line amount to the subtotal without touching any line total', () => {
      const dto = createInvoiceDtoFixture({
        serviceLines: [
          {
            name: "Main-d'œuvre",
            amountCents: 10000,
            visibility: 'VISIBLE',
          },
        ],
      });
      const preview = mapper.toPreviewPdfData(dto, companyFixture());

      expect(preview.lines[0].totalCents).toBe(45000);
      expect(preview.serviceLines).toEqual([{ name: "Main-d'œuvre", amountCents: 10000 }]);
      expect(preview.subtotalExclVatCents).toBe(45000 + 10000);
    });

    it('folds an EQUAL REDISTRIBUTED service line evenly across every draft line, matching the persisted expansion rule', () => {
      const twoLines: CreateInvoiceLineDto[] = [
        {
          description: 'Parquet',
          unit: 'SQUARE_METER',
          quantity: 10,
          unitPriceCents: 4500,
          wasteSurcharge: 'NONE',
        },
        {
          description: 'Plinthes',
          unit: 'UNIT',
          quantity: 5,
          unitPriceCents: 800,
          wasteSurcharge: 'NONE',
        },
      ];
      const dto = createInvoiceDtoFixture({
        lines: twoLines,
        serviceLines: [
          {
            name: 'Savoir-faire',
            amountCents: 10000,
            visibility: 'REDISTRIBUTED',
            redistributionStrategy: RedistributionStrategy.EQUAL,
          },
        ],
      });
      const preview = mapper.toPreviewPdfData(dto, companyFixture());

      const baseSubtotal = 45000 + 4000; // 10*4500 + 5*800
      const totalLineCents = preview.lines.reduce((sum, line) => sum + line.totalCents, 0);
      expect(totalLineCents).toBe(baseSubtotal + 10000);
      // No standalone service-line row for a REDISTRIBUTED line — already
      // folded into the lines above, same rule as the persisted path.
      expect(preview.serviceLines).toEqual([]);
      expect(preview.subtotalExclVatCents).toBe(baseSubtotal + 10000);
    });

    it('folds a WEIGHTED REDISTRIBUTED service line by the given per-line weights', () => {
      const twoLines: CreateInvoiceLineDto[] = [
        {
          description: 'Parquet',
          unit: 'SQUARE_METER',
          quantity: 10,
          unitPriceCents: 4500,
          wasteSurcharge: 'NONE',
        },
        {
          description: 'Plinthes',
          unit: 'UNIT',
          quantity: 5,
          unitPriceCents: 800,
          wasteSurcharge: 'NONE',
        },
      ];
      const dto = createInvoiceDtoFixture({
        lines: twoLines,
        serviceLines: [
          {
            name: 'Savoir-faire',
            amountCents: 10000,
            visibility: 'REDISTRIBUTED',
            redistributionStrategy: RedistributionStrategy.WEIGHTED,
            weights: [3, 1],
          },
        ],
      });
      const preview = mapper.toPreviewPdfData(dto, companyFixture());

      // weight 3:1 split of 10000 -> 7500 / 2500
      expect(preview.lines[0].totalCents).toBe(45000 + 7500);
      expect(preview.lines[1].totalCents).toBe(4000 + 2500);
    });
  });

  // Phase 15: the mandatory preview screen's HTML mirror reads this JSON
  // shape directly (via POST /invoices/preview-data) instead of a PDF blob —
  // it must expose exactly the same figures toPreviewPdfData renders, since
  // the two are built from the same computation (see toPreviewPdfData's
  // "compute once, reshape for PDF" comment).
  describe('toPreviewInvoiceWithTotals', () => {
    it('computes the same per-line and VAT totals as toPreviewPdfData, for equivalent input', () => {
      const dto = createInvoiceDtoFixture();
      const withTotals = mapper.toPreviewInvoiceWithTotals(dto, companyFixture());
      const pdfData = mapper.toPreviewPdfData(dto, companyFixture());

      expect(withTotals.lines[0].lineTotalExclVatCents).toBe(pdfData.lines[0].totalCents);
      expect(withTotals.subtotalExclVatCents).toBe(pdfData.subtotalExclVatCents);
      expect(withTotals.vatAmountCents).toBe(pdfData.vatAmountCents);
      expect(withTotals.totalInclVatCents).toBe(pdfData.totalInclVatCents);
    });

    it('never sets a real id or number, since nothing is persisted', () => {
      const preview = mapper.toPreviewInvoiceWithTotals(
        createInvoiceDtoFixture(),
        companyFixture(),
      );
      expect(preview.id).toBe('');
      expect(preview.number).toBe('BROUILLON');
    });

    it('exposes the billed (post-packaging-rounding) quantity, matching computeLineTotal', () => {
      const dto = createInvoiceDtoFixture({
        lines: [
          {
            description: 'Parquet',
            unit: 'SQUARE_METER',
            quantity: 23,
            unitPriceCents: 4500,
            wasteSurcharge: 'NONE',
            packagingQuantity: 9,
            roundUpToPackaging: true,
          },
        ],
      });
      const preview = mapper.toPreviewInvoiceWithTotals(dto, companyFixture());
      expect(preview.lines[0].quantity).toBe('23');
      expect(preview.lines[0].billedQuantity).toBe('27');
      expect(preview.lines[0].lineTotalExclVatCents).toBe(27 * 4500);
    });

    // Phase 15: the toggle state itself is round-tripped as-is (defaulting
    // true when omitted) — toPreviewInvoiceWithTotals never interprets it,
    // since hiding is a PdfService/toPreviewPdfData rendering concern only.
    it('carries showUnitDetail/showBillingDetail through unchanged, defaulting to true', () => {
      const dto = createInvoiceDtoFixture({
        lines: [
          {
            description: 'Parquet',
            unit: 'SQUARE_METER',
            quantity: 10,
            unitPriceCents: 4500,
            wasteSurcharge: 'NONE',
            showUnitDetail: false,
          },
          {
            description: 'Plinthes',
            unit: 'UNIT',
            quantity: 5,
            unitPriceCents: 800,
            wasteSurcharge: 'NONE',
          },
        ],
      });
      const preview = mapper.toPreviewInvoiceWithTotals(dto, companyFixture());
      expect(preview.lines[0].showUnitDetail).toBe(false);
      expect(preview.lines[0].showBillingDetail).toBe(true);
      expect(preview.lines[1].showUnitDetail).toBe(true);
    });

    it('folds a WEIGHTED REDISTRIBUTED service line into the referenced lines, exposing its distribution', () => {
      const dto = createInvoiceDtoFixture({
        lines: [
          {
            description: 'Parquet',
            unit: 'SQUARE_METER',
            quantity: 10,
            unitPriceCents: 4500,
            wasteSurcharge: 'NONE',
          },
          {
            description: 'Plinthes',
            unit: 'UNIT',
            quantity: 5,
            unitPriceCents: 800,
            wasteSurcharge: 'NONE',
          },
        ],
        serviceLines: [
          {
            name: 'Savoir-faire',
            amountCents: 10000,
            visibility: 'REDISTRIBUTED',
            redistributionStrategy: RedistributionStrategy.WEIGHTED,
            weights: [3, 1],
          },
        ],
      });
      const preview = mapper.toPreviewInvoiceWithTotals(dto, companyFixture());

      // weight 3:1 split of 10000 -> 7500 / 2500
      expect(preview.lines[0].lineTotalExclVatCents).toBe(45000 + 7500);
      expect(preview.lines[1].lineTotalExclVatCents).toBe(4000 + 2500);
      expect(preview.serviceLines[0].distribution).toEqual([
        { invoiceLineId: '0', amountCents: 7500 },
        { invoiceLineId: '1', amountCents: 2500 },
      ]);
    });

    it('recomputes the displayed unit price on the draft preview too, matching the persisted-path fix', () => {
      const dto = createInvoiceDtoFixture({
        lines: [
          {
            description: 'Salzer',
            unit: 'SQUARE_METER',
            quantity: 25,
            unitPriceCents: 400,
            wasteSurcharge: 'NONE',
          },
        ],
        serviceLines: [
          {
            name: 'Marge 30%',
            amountCents: 3000,
            visibility: 'REDISTRIBUTED',
            redistributionStrategy: RedistributionStrategy.EQUAL,
          },
        ],
      });
      const preview = mapper.toPreviewInvoiceWithTotals(dto, companyFixture());

      expect(preview.lines[0].unitPriceCents).toBe(400);
      expect(preview.lines[0].lineTotalExclVatCents).toBe(13000);
      expect(preview.lines[0].displayUnitPriceCents).toBe(520);

      const pdf = mapper.toPreviewPdfData(dto, companyFixture());
      expect(pdf.lines[0].unitPriceCents).toBe(520);
    });
  });

  describe('Phase 9.5 manual invoice mode', () => {
    function manualInvoiceFixture(): InvoiceWithLines {
      return invoiceWithLines({
        entryMode: 'MANUAL',
        lines: [],
        manualColumns: [
          {
            id: 'col-desc',
            invoiceId: 'inv-1',
            position: 0,
            role: 'DESCRIPTION',
            label: 'Désignation',
            widthPx: null,
          },
          {
            id: 'col-qty',
            invoiceId: 'inv-1',
            position: 1,
            role: 'QUANTITY',
            label: 'Quantité',
            widthPx: null,
          },
          {
            id: 'col-price',
            invoiceId: 'inv-1',
            position: 2,
            role: 'UNIT_PRICE',
            label: 'Prix unitaire',
            widthPx: null,
          },
          {
            id: 'col-total',
            invoiceId: 'inv-1',
            position: 3,
            role: 'LINE_TOTAL',
            label: 'Total',
            widthPx: null,
          },
        ],
        manualRows: [
          {
            id: 'row-1',
            invoiceId: 'inv-1',
            position: 0,
            heightPx: null,
            cells: [
              { id: 'cell-1', rowId: 'row-1', columnId: 'col-desc', value: 'Parquet chêne massif' },
              { id: 'cell-2', rowId: 'row-1', columnId: 'col-qty', value: '10' },
              { id: 'cell-3', rowId: 'row-1', columnId: 'col-price', value: '45.00' },
              { id: 'cell-4', rowId: 'row-1', columnId: 'col-total', value: '450.00' },
            ],
          },
        ],
      });
    }

    it('toInvoiceWithTotals reads the LINE_TOTAL cell directly and leaves lines/serviceLines empty', () => {
      const result = mapper.toInvoiceWithTotals(manualInvoiceFixture());

      expect(result.entryMode).toBe('MANUAL');
      expect(result.lines).toEqual([]);
      expect(result.serviceLines).toEqual([]);
      expect(result.manualTable!.rows[0].lineTotalExclVatCents).toBe(45000);
      expect(result.subtotalExclVatCents).toBe(45000);
    });

    it('toInvoiceWithTotals matches cells back to columns by id, regardless of the order cells were persisted in', () => {
      const invoice = manualInvoiceFixture();
      // Simulate cells coming back from Prisma in a different order than the
      // columns array — the mapper must match by columnId, not by index.
      invoice.manualRows[0].cells.reverse();

      const result = mapper.toInvoiceWithTotals(invoice);
      expect(result.manualTable!.rows[0].cells.map((cell) => cell.value)).toEqual([
        'Parquet chêne massif',
        '10',
        '45.00',
        '450.00',
      ]);
      expect(result.manualTable!.rows[0].lineTotalExclVatCents).toBe(45000);
    });

    it('toPdfData renders the manual table and reuses the same totals as toInvoiceWithTotals', () => {
      const invoice = manualInvoiceFixture();
      const withTotals = mapper.toInvoiceWithTotals(invoice);
      const pdfData = mapper.toPdfData(invoice);

      expect(pdfData.entryMode).toBe('MANUAL');
      expect(pdfData.manualTable!.rows[0].cells).toEqual(['Parquet chêne massif', '10', '45.00']);
      expect(pdfData.manualTable!.rows[0].totalCents).toBe(45000);
      expect(pdfData.totalInclVatCents).toBe(withTotals.totalInclVatCents);
    });

    it('toPreviewPdfData computes the same manual row total as the persisted path, for equivalent input', () => {
      const persisted = mapper.toPdfData(manualInvoiceFixture());
      const preview = mapper.toPreviewPdfData(
        createInvoiceDtoFixture({
          entryMode: 'MANUAL',
          lines: undefined,
          manualTable: {
            columns: [
              { role: 'DESCRIPTION', label: 'Désignation' },
              { role: 'QUANTITY', label: 'Quantité' },
              { role: 'UNIT_PRICE', label: 'Prix unitaire' },
              { role: 'LINE_TOTAL', label: 'Total' },
            ],
            rows: [{ cells: ['Parquet chêne massif', '10', '45.00', '450.00'] }],
          },
        }),
        companyFixture(),
      );

      expect(preview.entryMode).toBe('MANUAL');
      expect(preview.number).toBe('BROUILLON');
      expect(preview.manualTable!.rows[0].totalCents).toBe(
        persisted.manualTable!.rows[0].totalCents,
      );
      expect(preview.totalInclVatCents).toBe(persisted.totalInclVatCents);
    });

    describe('Phase 9.5 bis: totals override', () => {
      it('overriding the subtotal still recomputes VAT off the new (effective) subtotal', () => {
        const invoice = manualInvoiceFixture();
        invoice.subtotalOverrideCents = 100000; // rows alone sum to 45000

        const result = mapper.toInvoiceWithTotals(invoice);

        expect(result.subtotalExclVatCents).toBe(100000);
        expect(result.vatAmountCents).toBe(20000); // 20% of 100000
        expect(result.totalInclVatCents).toBe(120000);
      });

      it('overriding VAT directly leaves the subtotal computed from rows but replaces only the VAT amount', () => {
        const invoice = manualInvoiceFixture();
        invoice.vatOverrideCents = 500;

        const result = mapper.toInvoiceWithTotals(invoice);

        expect(result.subtotalExclVatCents).toBe(45000);
        expect(result.vatAmountCents).toBe(500);
        expect(result.totalInclVatCents).toBe(45500);
      });

      it('overriding the total skips the subtotal + VAT sum entirely', () => {
        const invoice = manualInvoiceFixture();
        invoice.totalOverrideCents = 999999;

        const result = mapper.toInvoiceWithTotals(invoice);

        expect(result.subtotalExclVatCents).toBe(45000);
        expect(result.vatAmountCents).toBe(9000);
        expect(result.totalInclVatCents).toBe(999999);
      });

      it('toManualPreviewPdfData applies the same override precedence off the DTO', () => {
        const preview = mapper.toPreviewPdfData(
          createInvoiceDtoFixture({
            entryMode: 'MANUAL',
            lines: undefined,
            manualTable: {
              columns: [
                { role: 'DESCRIPTION', label: 'Désignation' },
                { role: 'QUANTITY', label: 'Quantité' },
                { role: 'UNIT_PRICE', label: 'Prix unitaire' },
                { role: 'LINE_TOTAL', label: 'Total' },
              ],
              rows: [{ cells: ['Parquet chêne massif', '10', '45.00', '450.00'] }],
            },
            totalOverrideCents: 111100,
          }),
          companyFixture(),
        );

        expect(preview.subtotalExclVatCents).toBe(45000);
        expect(preview.vatAmountCents).toBe(9000);
        expect(preview.totalInclVatCents).toBe(111100);
      });
    });

    describe('VAT applicability/rate override', () => {
      // A manual invoice is meant to be edited as freely as everything else
      // on the canvas — vatApplicableOverride/vatRateBasisPointsOverride let
      // a single document diverge from the company's own default regime
      // (see CreateInvoiceDto).
      function manualPreviewDto(overrides: Partial<CreateInvoiceDto> = {}): CreateInvoiceDto {
        return createInvoiceDtoFixture({
          entryMode: 'MANUAL',
          lines: undefined,
          manualTable: {
            columns: [
              { role: 'DESCRIPTION', label: 'Désignation' },
              { role: 'QUANTITY', label: 'Quantité' },
              { role: 'UNIT_PRICE', label: 'Prix unitaire' },
              { role: 'LINE_TOTAL', label: 'Total' },
            ],
            rows: [{ cells: ['Parquet chêne massif', '10', '45.00', '450.00'] }],
          },
          ...overrides,
        });
      }

      it('overriding vatApplicable to false zeroes VAT even for a COMPANY whose default is VAT-applicable', () => {
        const preview = mapper.toPreviewPdfData(
          manualPreviewDto({ vatApplicableOverride: false }),
          companyFixture({ legalStatus: 'COMPANY', vatRateBasisPoints: 2000 }),
        );

        expect(preview.vatApplicable).toBe(false);
        expect(preview.vatAmountCents).toBe(0);
        expect(preview.totalInclVatCents).toBe(preview.subtotalExclVatCents);
        // The company itself is still VAT-registered — art. 293 B would be a
        // false citation for it, so PdfService must not print it here.
        expect(preview.companyVatExempt).toBe(false);
      });

      it('overriding vatApplicable to true charges VAT even for a MICRO_ENTREPRENEUR whose default is exempt', () => {
        const preview = mapper.toPreviewPdfData(
          manualPreviewDto({ vatApplicableOverride: true, vatRateBasisPointsOverride: 1000 }),
          companyFixture({ legalStatus: 'MICRO_ENTREPRENEUR', vatRateBasisPoints: 0 }),
        );

        expect(preview.vatApplicable).toBe(true);
        expect(preview.vatRateBasisPoints).toBe(1000);
        expect(preview.vatAmountCents).toBe(4500); // 10% of the 45000 subtotal
      });

      it('overriding only the rate keeps using the company default for applicability', () => {
        const preview = mapper.toPreviewPdfData(
          manualPreviewDto({ vatRateBasisPointsOverride: 550 }),
          companyFixture({ legalStatus: 'COMPANY', vatRateBasisPoints: 2000 }),
        );

        expect(preview.vatApplicable).toBe(true);
        expect(preview.vatRateBasisPoints).toBe(550);
        expect(preview.vatAmountCents).toBe(2475); // 5.5% of 45000
      });

      it('omitting both overrides falls back to the company default, unchanged', () => {
        const preview = mapper.toPreviewPdfData(
          manualPreviewDto(),
          companyFixture({ legalStatus: 'COMPANY', vatRateBasisPoints: 2000 }),
        );

        expect(preview.vatApplicable).toBe(true);
        expect(preview.vatRateBasisPoints).toBe(2000);
      });
    });
  });
});
