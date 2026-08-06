import { PlanGateService } from '../billing/plan-gate.service';
import { InvoiceCalculationService } from '../invoice/calculation/invoice-calculation.service';
import { InvoiceMapper } from '../invoice/invoice.mapper';
import { InvoiceRepository, InvoiceWithLines } from '../invoice/invoice.repository';
import { CompanyService } from '../company/company.service';
import { CompanyProfile } from '../company/entities/company.entity';
import { ReportsService } from './reports.service';

function companyFixture(overrides: Partial<CompanyProfile> = {}): CompanyProfile {
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
    trialOfferExpiresAt: null,
    declarationFrequency: 'TRIMESTRIELLE',
    microEntrepreneurCeiling: null,
    cotisationVenteBasisPoints: 1230,
    cotisationPrestationBicBasisPoints: 2120,
    cotisationPrestationBncBasisPoints: 2110,
    versementLiberatoireOptIn: false,
    decennialInsuranceApplicable: false,
    decennialInsurerName: null,
    decennialInsurancePolicyNumber: null,
    decennialInsuranceCoverageArea: null,
    hasLogo: false,
    createdAt: new Date('2026-01-15'),
    updatedAt: new Date('2026-01-15'),
    ...overrides,
  };
}

function invoiceFixture(overrides: Partial<InvoiceWithLines> = {}): InvoiceWithLines {
  return {
    id: 'inv-1',
    number: 'F-000001',
    date: new Date('2026-04-10'),
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
    status: 'PAYEE',
    dueDate: null,
    paidAt: new Date('2026-04-12'),
    lastReminderAt: null,
    lastPushReminderAt: null,
    createdAt: new Date('2026-04-10'),
    updatedAt: new Date('2026-04-10'),
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
        activityCategory: 'VENTE_MARCHANDISES',
        createdAt: new Date('2026-04-10'),
      },
    ],
    serviceLines: [],
    discountLines: [],
    manualColumns: [],
    manualRows: [],
    customerFields: [],
    company: companyFixture(),
    ...overrides,
  };
}

describe('ReportsService', () => {
  function setup() {
    const invoiceRepository = {
      findPaidInRange: jest.fn(),
      findOutstanding: jest.fn(),
    } as unknown as jest.Mocked<InvoiceRepository>;
    const companyService = {
      getProfile: jest.fn(),
    } as unknown as jest.Mocked<CompanyService>;
    const planGateService = {
      assertFeatureAccess: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PlanGateService>;
    const mapper = new InvoiceMapper(new InvoiceCalculationService());
    const service = new ReportsService(invoiceRepository, mapper, companyService, planGateService);
    return { service, invoiceRepository, companyService, planGateService };
  }

  describe('getQuarterlyReport', () => {
    it('buckets a categorized line under its own category and sums to the invoice total', async () => {
      const { service, invoiceRepository, companyService } = setup();
      invoiceRepository.findPaidInRange.mockResolvedValue([invoiceFixture()]);
      companyService.getProfile.mockResolvedValue(companyFixture());

      const report = await service.getQuarterlyReport(
        'company-1',
        new Date('2026-04-01'),
        new Date('2026-06-30'),
      );

      expect(report.totalExclVatCents).toBe(45000);
      expect(report.byCategory).toEqual([
        { category: 'VENTE_MARCHANDISES', totalExclVatCents: 45000 },
        { category: 'PRESTATION_BIC', totalExclVatCents: 0 },
        { category: 'PRESTATION_BNC', totalExclVatCents: 0 },
        { category: 'NON_CATEGORISE', totalExclVatCents: 0 },
      ]);
      expect(report.invoices).toEqual([
        expect.objectContaining({ number: 'F-000001', totalInclVatCents: 54000 }),
      ]);
    });

    it('buckets an uncategorized line under NON_CATEGORISE', async () => {
      const { service, invoiceRepository, companyService } = setup();
      invoiceRepository.findPaidInRange.mockResolvedValue([
        invoiceFixture({
          lines: [
            {
              ...invoiceFixture().lines[0],
              activityCategory: null,
            },
          ],
        }),
      ]);
      companyService.getProfile.mockResolvedValue(companyFixture());

      const report = await service.getQuarterlyReport(
        'company-1',
        new Date('2026-04-01'),
        new Date('2026-06-30'),
      );

      const uncategorized = report.byCategory.find((entry) => entry.category === 'NON_CATEGORISE')!;
      expect(uncategorized.totalExclVatCents).toBe(45000);
    });

    it('omits the plafond warning when no ceiling is configured', async () => {
      const { service, invoiceRepository, companyService } = setup();
      invoiceRepository.findPaidInRange.mockResolvedValue([]);
      companyService.getProfile.mockResolvedValue(
        companyFixture({ microEntrepreneurCeiling: null }),
      );

      const report = await service.getQuarterlyReport(
        'company-1',
        new Date('2026-04-01'),
        new Date('2026-06-30'),
      );

      expect(report.plafondWarning).toBeNull();
    });

    it('computes the plafond warning as a percentage of year-to-date encaissements', async () => {
      const { service, invoiceRepository, companyService } = setup();
      invoiceRepository.findPaidInRange.mockResolvedValue([invoiceFixture()]);
      companyService.getProfile.mockResolvedValue(
        companyFixture({ microEntrepreneurCeiling: 90000 }),
      );

      const report = await service.getQuarterlyReport(
        'company-1',
        new Date('2026-04-01'),
        new Date('2026-06-30'),
      );

      expect(report.plafondWarning).toEqual({
        ceilingCents: 90000,
        yearToDateCents: 45000,
        percentageUsed: 50,
      });
    });
  });

  describe('estimatedCharges', () => {
    it('is not applicable for a COMPANY — a real company’s tax depends on expenses this app can’t know', async () => {
      const { service, invoiceRepository, companyService } = setup();
      invoiceRepository.findPaidInRange.mockResolvedValue([invoiceFixture()]);
      companyService.getProfile.mockResolvedValue(companyFixture({ legalStatus: 'COMPANY' }));

      const report = await service.getQuarterlyReport(
        'company-1',
        new Date('2026-04-01'),
        new Date('2026-06-30'),
      );

      expect(report.estimatedCharges.applicable).toBe(false);
      expect(report.estimatedCharges.rows).toEqual([]);
      expect(report.estimatedCharges.totalEstimatedCents).toBe(0);
    });

    it('applies the company’s own cotisation rate per category, using its own editable settings', async () => {
      const { service, invoiceRepository, companyService } = setup();
      invoiceRepository.findPaidInRange.mockResolvedValue([invoiceFixture()]); // 45000 cents VENTE_MARCHANDISES
      companyService.getProfile.mockResolvedValue(
        companyFixture({
          legalStatus: 'MICRO_ENTREPRENEUR',
          cotisationVenteBasisPoints: 1230, // 12.3%
        }),
      );

      const report = await service.getQuarterlyReport(
        'company-1',
        new Date('2026-04-01'),
        new Date('2026-06-30'),
      );

      const venteRow = report.estimatedCharges.rows.find(
        (row) => row.category === 'VENTE_MARCHANDISES',
      )!;
      expect(venteRow.cotisationCents).toBe(5535); // 45000 * 12.3%
      expect(report.estimatedCharges.cotisationsSocialesCents).toBe(5535);
      expect(report.estimatedCharges.versementLiberatoireCents).toBe(0);
      expect(report.estimatedCharges.totalEstimatedCents).toBe(5535);
    });

    it('adds the versement libératoire only when the company opted in', async () => {
      const { service, invoiceRepository, companyService } = setup();
      invoiceRepository.findPaidInRange.mockResolvedValue([invoiceFixture()]); // 45000 cents VENTE_MARCHANDISES
      companyService.getProfile.mockResolvedValue(
        companyFixture({
          legalStatus: 'MICRO_ENTREPRENEUR',
          cotisationVenteBasisPoints: 1230,
          versementLiberatoireOptIn: true,
        }),
      );

      const report = await service.getQuarterlyReport(
        'company-1',
        new Date('2026-04-01'),
        new Date('2026-06-30'),
      );

      expect(report.estimatedCharges.versementLiberatoireOptIn).toBe(true);
      expect(report.estimatedCharges.versementLiberatoireCents).toBe(450); // 45000 * 1%
      expect(report.estimatedCharges.totalEstimatedCents).toBe(5535 + 450);
    });

    it('excludes uncategorized turnover from the estimate, calling out the excluded amount', async () => {
      const { service, invoiceRepository, companyService } = setup();
      invoiceRepository.findPaidInRange.mockResolvedValue([
        invoiceFixture({
          lines: [{ ...invoiceFixture().lines[0], activityCategory: null }],
        }),
      ]);
      companyService.getProfile.mockResolvedValue(
        companyFixture({ legalStatus: 'MICRO_ENTREPRENEUR' }),
      );

      const report = await service.getQuarterlyReport(
        'company-1',
        new Date('2026-04-01'),
        new Date('2026-06-30'),
      );

      expect(report.estimatedCharges.uncategorizedExclVatCents).toBe(45000);
      expect(report.estimatedCharges.cotisationsSocialesCents).toBe(0);
      expect(report.estimatedCharges.totalEstimatedCents).toBe(0);
    });
  });

  describe('getActivityAnalytics', () => {
    it('sums outstanding invoices independently of the paid window', async () => {
      const { service, invoiceRepository } = setup();
      invoiceRepository.findPaidInRange.mockResolvedValue([]);
      invoiceRepository.findOutstanding.mockResolvedValue([
        invoiceFixture({ status: 'NON_PAYEE', paidAt: null }),
      ]);

      const analytics = await service.getActivityAnalytics('company-1');

      expect(analytics.outstandingTotalCents).toBe(45000);
      expect(analytics.invoiceCount).toBe(0);
    });

    it('always returns 12 months of revenue points, zero-filled where there is no activity', async () => {
      const { service, invoiceRepository } = setup();
      invoiceRepository.findPaidInRange.mockResolvedValue([]);
      invoiceRepository.findOutstanding.mockResolvedValue([]);

      const analytics = await service.getActivityAnalytics('company-1');

      expect(analytics.revenueByMonth).toHaveLength(12);
      expect(analytics.revenueByMonth.every((point) => point.totalExclVatCents === 0)).toBe(true);
    });

    it('ranks top clients/products by total HT amount, most first', async () => {
      const { service, invoiceRepository } = setup();
      invoiceRepository.findPaidInRange.mockResolvedValue([
        invoiceFixture({ id: 'inv-1', customerName: 'Client A' }),
        invoiceFixture({
          id: 'inv-2',
          customerName: 'Client B',
          lines: [
            {
              ...invoiceFixture().lines[0],
              id: 'line-2',
              unitPriceCents: 9000,
            },
          ],
        }),
      ]);
      invoiceRepository.findOutstanding.mockResolvedValue([]);

      const analytics = await service.getActivityAnalytics('company-1');

      expect(analytics.topClients[0].label).toBe('Client B');
      expect(analytics.topClients[0].totalCents).toBe(90000);
      expect(analytics.activeClientCount).toBe(2);
    });
  });
});
