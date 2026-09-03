import { Injectable } from '@nestjs/common';
import { ActivityCategory, InvoiceStatus, LegalStatus } from '../../generated/prisma/enums';
import { CompanyModel } from '../../generated/prisma/models';
import { PlanGateService } from '../billing/plan-gate.service';
import { CompanyService } from '../company/company.service';
import { MarginConfig, resolveMarginCents } from '../common/margin.util';
import { CompanySuperPdpService } from '../invoice/e-invoicing/company-super-pdp.service';
import { InvoiceWithTotals } from '../invoice/entities/invoice.entity';
import { InvoiceMapper } from '../invoice/invoice.mapper';
import { InvoiceRepository } from '../invoice/invoice.repository';
import { ProductService } from '../product/product.service';
import { ReceivedInvoiceRepository } from '../received-invoice/received-invoice.repository';
import { ServiceCatalogService } from '../service-catalog/service-catalog.service';
import {
  REPORT_CATEGORY_ORDER,
  resolveReportCategory,
  VERSEMENT_LIBERATOIRE_RATE_BASIS_POINTS,
} from './activity-category.util';
import {
  ActivityAnalytics,
  CategoryTotal,
  EInvoicingSnapshot,
  EstimatedCharges,
  EstimatedChargesCategoryRow,
  MarginAnalytics,
  MarginByEntry,
  PlafondWarning,
  QuarterlyReport,
  ReportCategory,
  ReportInvoiceEntry,
  TopEntry,
  UNCATEGORIZED,
} from './entities/report.entity';

// How far back Activity Analytics looks — every figure in ActivityAnalytics
// (revenueByMonth, topClients/topProducts/topServices, invoiceCount,
// averageInvoiceValueCents, activeClientCount/activeProductCount) describes
// this same rolling window, so they never disagree on what "activity" means.
// outstandingTotalCents is the one exception: an unpaid invoice has no
// paidAt to scope by, so it's always the company's entire unpaid book.
const ANALYTICS_WINDOW_MONTHS = 12;
const TOP_ENTRIES_LIMIT = 5;

// Orchestration only, same shape as InvoiceService: loads company + invoice
// data via the repository, delegates totals computation entirely to
// InvoiceMapper (reused as-is, see docs/conventions.md's "no business-logic
// duplication" — this class never recomputes a line/VAT total itself), and
// only adds the category-bucketing/aggregation that's specific to reporting.
//
// Every figure here is HT (excl. VAT) — including Activity Analytics, which
// isn't itself a tax document — so there is exactly one convention to reason
// about across the whole feature, not two. The Quarterly Report's per-invoice
// audit-trail list is the one deliberate exception: it shows each invoice's
// TTC total, since that's the amount that actually landed in the artisan's
// bank account and is what they'll cross-check this report against.
@Injectable()
export class ReportsService {
  constructor(
    private readonly invoiceRepository: InvoiceRepository,
    private readonly invoiceMapper: InvoiceMapper,
    private readonly companyService: CompanyService,
    private readonly planGateService: PlanGateService,
    private readonly companySuperPdp: CompanySuperPdpService,
    private readonly receivedInvoiceRepository: ReceivedInvoiceRepository,
    private readonly productService: ProductService,
    private readonly serviceCatalogService: ServiceCatalogService,
  ) {}

  async getQuarterlyReport(companyId: string, from: Date, to: Date): Promise<QuarterlyReport> {
    const [rawInvoices, company] = await Promise.all([
      this.invoiceRepository.findPaidInRange(companyId, from, to),
      this.companyService.getProfile(companyId),
    ]);
    const invoices = rawInvoices.map((invoice) => this.invoiceMapper.toInvoiceWithTotals(invoice));

    const byCategory = this.bucketByCategory(invoices);
    const totalExclVatCents = byCategory.reduce((sum, entry) => sum + entry.totalExclVatCents, 0);

    const reportInvoices: ReportInvoiceEntry[] = invoices.map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      customerName: invoice.customerName,
      // Never null here: findPaidInRange only ever returns status PAYEE
      // invoices, and InvoiceService.updateStatus always sets paidAt when
      // entering PAYEE (see schema.prisma's comment on Invoice.paidAt).
      paidAt: invoice.paidAt!,
      totalInclVatCents: invoice.totalInclVatCents,
    }));

    const plafondWarning = company.microEntrepreneurCeiling
      ? await this.computePlafondWarning(companyId, company.microEntrepreneurCeiling)
      : null;

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      totalExclVatCents,
      byCategory,
      invoices: reportInvoices,
      plafondWarning,
      estimatedCharges: this.computeEstimatedCharges(company, byCategory),
    };
  }

  // Phase 30: the only part of Phase 17 that's gated — see
  // ReportsController's class comment and docs/roadmap.md Phase 30 for why
  // getQuarterlyReport (the URSSAF declaration) deliberately stays free on
  // every tier while this pure-business-insight view doesn't.
  async getActivityAnalytics(companyId: string): Promise<ActivityAnalytics> {
    await this.planGateService.assertFeatureAccess(companyId, 'analytics');
    const now = new Date();
    const windowStart = startOfMonthsAgo(now, ANALYTICS_WINDOW_MONTHS - 1);

    const [rawPaid, rawOutstanding, unsignedFactureCount] = await Promise.all([
      this.invoiceRepository.findPaidInRange(companyId, windowStart, now),
      this.invoiceRepository.findOutstanding(companyId),
      this.invoiceRepository.countUnsigned(companyId),
    ]);
    const paid = rawPaid.map((invoice) => this.invoiceMapper.toInvoiceWithTotals(invoice));
    const outstanding = rawOutstanding.map((invoice) =>
      this.invoiceMapper.toInvoiceWithTotals(invoice),
    );

    const totalHtCents = paid.reduce((sum, invoice) => sum + invoice.subtotalExclVatCents, 0);
    const outstandingTotalCents = outstanding.reduce(
      (sum, invoice) => sum + outstandingHtCents(invoice),
      0,
    );

    const clientIds = new Set<string>();
    const productKeys = new Set<string>();
    const clientTotals = new Map<string, TopEntry>();
    const productTotals = new Map<string, TopEntry>();
    const serviceTotals = new Map<string, TopEntry>();

    for (const invoice of paid) {
      clientIds.add(invoice.customerId ?? invoice.customerName);
      addToTopEntry(clientTotals, invoice.customerName, invoice.subtotalExclVatCents);

      if (invoice.entryMode !== 'GUIDED') {
        continue; // MANUAL rows aren't tied to any catalog item — see docs/roadmap.md Phase 17.
      }
      for (const line of invoice.lines) {
        const key = line.productCode ?? line.description;
        productKeys.add(key);
        addToTopEntry(productTotals, key, line.lineTotalExclVatCents);
      }
      for (const serviceLine of invoice.serviceLines) {
        if (serviceLine.visibility === 'VISIBLE') {
          addToTopEntry(serviceTotals, serviceLine.name, serviceLine.amountCents);
        }
      }
    }

    return {
      revenueByMonth: bucketRevenueByMonth(paid, windowStart, ANALYTICS_WINDOW_MONTHS),
      topClients: topEntries(clientTotals),
      topProducts: topEntries(productTotals),
      topServices: topEntries(serviceTotals),
      outstandingTotalCents,
      invoiceCount: paid.length,
      averageInvoiceValueCents: paid.length > 0 ? Math.round(totalHtCents / paid.length) : 0,
      activeClientCount: clientIds.size,
      activeProductCount: productKeys.size,
      unsignedFactureCount,
    };
  }

  // Phase 1.3-6 (2026 e-invoicing reform, workflow automation): deliberately
  // NOT gated behind assertFeatureAccess like getActivityAnalytics above —
  // see docs/1.3/1.3-6-activity-analytics-metrics.md's own "Correction vs.
  // the original plan" section. An e-invoicing compliance snapshot reads
  // much closer to "legal necessity" (same category as the free quarterly
  // report) than "business insight" — an artisan needs to know their own
  // reform-compliance status regardless of subscription tier.
  async getEInvoicingSnapshot(companyId: string): Promise<EInvoicingSnapshot> {
    const now = new Date();
    const windowStart = startOfMonthsAgo(now, ANALYTICS_WINDOW_MONTHS - 1);

    const [
      connected,
      facturesInWindow,
      transmittedFacturesInWindow,
      unsentFactureCount,
      receivedInvoiceCount,
    ] = await Promise.all([
      this.companySuperPdp.isConnected(companyId),
      this.invoiceRepository.countFacturesInRange(companyId, windowStart, now),
      this.invoiceRepository.countTransmittedFacturesInRange(companyId, windowStart, now),
      this.invoiceRepository.countUnsentFactures(companyId),
      this.receivedInvoiceRepository.countInRange(companyId, windowStart, now),
    ]);

    return {
      configured: this.companySuperPdp.isConfigured(),
      connected,
      facturesInWindow,
      transmittedFacturesInWindow,
      // Null, not 0 — a company with no FACTUREs in the window has nothing
      // to divide by, which reads very differently from "0% transmitted."
      transmissionRatePercent:
        facturesInWindow > 0
          ? Math.round((transmittedFacturesInWindow / facturesInWindow) * 100)
          : null,
      unsentFactureCount,
      receivedInvoiceCount,
    };
  }

  // Phase 1.6: "Marge" tab — see docs/1.6/1.6-2-margin-analytics-backend.md
  // for the full per-line resolution rules this delegates to
  // resolveMarginCents for. Gated like getActivityAnalytics (business
  // insight, not a legal necessity) — see this file's class comment isn't
  // updated for this yet on purpose, ReportsController's own class comment
  // is where that distinction actually lives.
  async getMarginAnalytics(companyId: string): Promise<MarginAnalytics> {
    await this.planGateService.assertFeatureAccess(companyId, 'analytics');
    const now = new Date();
    const windowStart = startOfMonthsAgo(now, ANALYTICS_WINDOW_MONTHS - 1);

    const [rawPaid, company] = await Promise.all([
      this.invoiceRepository.findPaidInRange(companyId, windowStart, now),
      this.companyService.getProfile(companyId),
    ]);
    const paid = rawPaid.map((invoice) => this.invoiceMapper.toInvoiceWithTotals(invoice));

    const productIds = new Set<string>();
    const serviceIds = new Set<string>();
    for (const invoice of paid) {
      if (invoice.entryMode !== 'GUIDED') {
        continue; // MANUAL rows aren't tied to any catalog item — same skip as getActivityAnalytics.
      }
      for (const line of invoice.lines) {
        if (line.productId) {
          productIds.add(line.productId);
        }
      }
      for (const serviceLine of invoice.serviceLines) {
        if (serviceLine.serviceId) {
          serviceIds.add(serviceLine.serviceId);
        }
      }
    }
    const [productMarginById, serviceMarginById] = await Promise.all([
      this.productService.findMarginConfigByIds(companyId, [...productIds]),
      this.serviceCatalogService.findMarginConfigByIds(companyId, [...serviceIds]),
    ]);

    let totalRevenueExclVatCents = 0;
    let totalMarginExclVatCents = 0;
    let uncategorizedRevenueExclVatCents = 0;
    const productTotals = new Map<string, { revenue: number; margin: number; count: number }>();
    const serviceTotals = new Map<string, { revenue: number; margin: number; count: number }>();
    const clientTotals = new Map<string, { revenue: number; margin: number; count: number }>();
    const monthTotals = new Map<string, { revenue: number; margin: number }>();
    for (let i = 0; i < ANALYTICS_WINDOW_MONTHS; i++) {
      const month = new Date(
        Date.UTC(windowStart.getUTCFullYear(), windowStart.getUTCMonth() + i, 1),
      );
      monthTotals.set(monthKey(month), { revenue: 0, margin: 0 });
    }

    for (const invoice of paid) {
      // The display label, not a uniqueness key — same convention
      // getActivityAnalytics' own topClients uses (customerName, never
      // customerId; a real bug caught live before this fix: the by-client
      // donut rendered a raw customerId UUID instead of a name).
      const clientKey = invoice.customerName;
      // paidAt is always set here — same contract as bucketRevenueByMonth's
      // identical comment on findPaidInRange.
      const monthEntry = monthTotals.get(monthKey(invoice.paidAt!));

      if (invoice.entryMode !== 'GUIDED') {
        // MANUAL invoices have no catalog lines at all — the whole subtotal
        // is unresolved margin, same precedent as bucketByCategory/
        // getActivityAnalytics apply to manual rows.
        totalRevenueExclVatCents += invoice.subtotalExclVatCents;
        uncategorizedRevenueExclVatCents += invoice.subtotalExclVatCents;
        addMarginTotal(clientTotals, clientKey, invoice.subtotalExclVatCents, 0);
        if (monthEntry) {
          monthEntry.revenue += invoice.subtotalExclVatCents;
        }
        continue;
      }

      let invoiceRevenueCents = 0;
      let invoiceMarginCents = 0;

      for (const line of invoice.lines) {
        const revenueCents = line.lineTotalExclVatCents;
        const config = line.productId ? productMarginById.get(line.productId) : undefined;
        const marginCents = resolveMarginCents(config, revenueCents, Number(line.billedQuantity));
        if (!hasCatalogMarginObject(config)) {
          uncategorizedRevenueExclVatCents += revenueCents;
        }
        addMarginTotal(
          productTotals,
          line.productCode ?? line.description,
          revenueCents,
          marginCents,
        );
        invoiceRevenueCents += revenueCents;
        invoiceMarginCents += marginCents;
      }

      // A REDISTRIBUTED service line's own margin IS counted here, just
      // like a VISIBLE one — deliberately different from bucketByCategory's
      // own REDISTRIBUTED handling, see docs/1.6/README.md's scope decision
      // for why margin answers a different question than revenue-category
      // bucketing does. Its REVENUE is a different story: amountCents is
      // already folded into the product lines' own (inflated)
      // lineTotalExclVatCents above (see InvoiceMapper), so adding it again
      // here would double-count the same euros — same reasoning
      // bucketByCategory's own comment gives for skipping REDISTRIBUTED
      // entirely. marginByService still gets this row (with its own
      // amountCents as that row's revenue, for its own marginRatePercent),
      // just never folded into invoiceRevenueCents/totalRevenueExclVatCents
      // or uncategorizedRevenueExclVatCents.
      for (const serviceLine of invoice.serviceLines) {
        const revenueCents = serviceLine.amountCents;
        const config = serviceLine.serviceId
          ? serviceMarginById.get(serviceLine.serviceId)
          : undefined;
        const marginCents = resolveMarginCents(config, revenueCents, 1);
        addMarginTotal(serviceTotals, serviceLine.name, revenueCents, marginCents);
        invoiceMarginCents += marginCents;
        if (serviceLine.visibility === 'VISIBLE') {
          if (!hasCatalogMarginObject(config)) {
            uncategorizedRevenueExclVatCents += revenueCents;
          }
          invoiceRevenueCents += revenueCents;
        }
      }

      totalRevenueExclVatCents += invoiceRevenueCents;
      totalMarginExclVatCents += invoiceMarginCents;
      addMarginTotal(clientTotals, clientKey, invoiceRevenueCents, invoiceMarginCents);
      if (monthEntry) {
        monthEntry.revenue += invoiceRevenueCents;
        monthEntry.margin += invoiceMarginCents;
      }
    }
    const byCategory = this.bucketByCategory(paid);
    const estimatedCharges = this.computeEstimatedCharges(company, byCategory);
    const netProfitAfterCharges = {
      applicable: estimatedCharges.applicable,
      totalMarginExclVatCents,
      estimatedChargesCents: estimatedCharges.totalEstimatedCents,
      netCents: totalMarginExclVatCents - estimatedCharges.totalEstimatedCents,
    };

    return {
      totalRevenueExclVatCents,
      totalMarginExclVatCents,
      marginRatePercent: percentOrNull(totalMarginExclVatCents, totalRevenueExclVatCents),
      marginCoveragePercent: percentOrNull(
        totalRevenueExclVatCents - uncategorizedRevenueExclVatCents,
        totalRevenueExclVatCents,
      ),
      uncategorizedRevenueExclVatCents,
      marginByProduct: marginTopEntries(productTotals),
      marginByService: marginTopEntries(serviceTotals),
      marginByClient: marginTopEntries(clientTotals),
      marginByMonth: [...monthTotals.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, totals]) => ({
          month,
          revenueExclVatCents: totals.revenue,
          marginExclVatCents: totals.margin,
        })),
      netProfitAfterCharges,
    };
  }

  // Live year-to-date figure — always relative to today, independent of
  // whatever period the artisan happens to be viewing in the report screen
  // (a plafond is tracked calendar-year over calendar-year, not per quarter).
  private async computePlafondWarning(
    companyId: string,
    ceilingCents: number,
  ): Promise<PlafondWarning> {
    const now = new Date();
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const rawInvoices = await this.invoiceRepository.findPaidInRange(companyId, yearStart, now);
    const yearToDateCents = rawInvoices.reduce(
      (sum, invoice) => sum + this.invoiceMapper.toInvoiceWithTotals(invoice).subtotalExclVatCents,
      0,
    );
    return {
      ceilingCents,
      yearToDateCents,
      percentageUsed: ceilingCents > 0 ? Math.round((yearToDateCents / ceilingCents) * 100) : 0,
    };
  }

  // REDISTRIBUTED service-line amounts are deliberately never bucketed
  // separately here: InvoiceCalculationService already folded them into the
  // product lines' own lineTotalExclVatCents (see InvoiceMapper), so summing
  // by each line's own activityCategory already captures that value exactly
  // once. A MANUAL invoice has no per-line categorization at all (see
  // schema.prisma's comment on ManualColumnRole) — its whole subtotal lands
  // in the "non catégorisé" bucket instead of being silently dropped.
  private bucketByCategory(invoices: InvoiceWithTotals[]): CategoryTotal[] {
    const totals = new Map<ReportCategory, number>();
    const add = (category: ReportCategory, cents: number) =>
      totals.set(category, (totals.get(category) ?? 0) + cents);

    for (const invoice of invoices) {
      if (invoice.entryMode === 'MANUAL') {
        add(UNCATEGORIZED, invoice.subtotalExclVatCents);
        continue;
      }
      for (const line of invoice.lines) {
        add(resolveReportCategory(line.activityCategory), line.lineTotalExclVatCents);
      }
      for (const serviceLine of invoice.serviceLines) {
        if (serviceLine.visibility === 'VISIBLE') {
          add(resolveReportCategory(serviceLine.activityCategory), serviceLine.amountCents);
        }
      }
    }

    return REPORT_CATEGORY_ORDER.map((category) => ({
      category,
      totalExclVatCents: totals.get(category) ?? 0,
    }));
  }

  // Phase 17 (charges estimate): only meaningful for a micro-entrepreneur —
  // a COMPANY's real IS/IR depends on deductible expenses this app has no
  // way to know, so it gets an honest "not applicable" instead of a guess
  // (see docs/roadmap.md Phase 17's non-goals and EstimatedCharges' own
  // comment). Rates come from the company's own editable settings, never a
  // hardcoded constant here — see schema.prisma's comment on
  // Company.cotisationVenteBasisPoints for why.
  private computeEstimatedCharges(
    company: CompanyModel,
    byCategory: CategoryTotal[],
  ): EstimatedCharges {
    const uncategorizedExclVatCents =
      byCategory.find((entry) => entry.category === UNCATEGORIZED)?.totalExclVatCents ?? 0;

    if (company.legalStatus !== LegalStatus.MICRO_ENTREPRENEUR) {
      return {
        applicable: false,
        versementLiberatoireOptIn: false,
        rows: [],
        uncategorizedExclVatCents,
        cotisationsSocialesCents: 0,
        versementLiberatoireCents: 0,
        totalEstimatedCents: 0,
      };
    }

    const cotisationRateByCategory: Record<ActivityCategory, number> = {
      VENTE_MARCHANDISES: company.cotisationVenteBasisPoints,
      PRESTATION_BIC: company.cotisationPrestationBicBasisPoints,
      PRESTATION_BNC: company.cotisationPrestationBncBasisPoints,
    };

    const rows: EstimatedChargesCategoryRow[] = (
      ['VENTE_MARCHANDISES', 'PRESTATION_BIC', 'PRESTATION_BNC'] as ActivityCategory[]
    ).map((category) => {
      const totalExclVatCents =
        byCategory.find((entry) => entry.category === category)?.totalExclVatCents ?? 0;
      const cotisationRateBasisPoints = cotisationRateByCategory[category];
      const versementLiberatoireRateBasisPoints = company.versementLiberatoireOptIn
        ? VERSEMENT_LIBERATOIRE_RATE_BASIS_POINTS[category]
        : 0;
      return {
        category,
        totalExclVatCents,
        cotisationRateBasisPoints,
        cotisationCents: Math.round((totalExclVatCents * cotisationRateBasisPoints) / 10_000),
        versementLiberatoireRateBasisPoints,
        versementLiberatoireCents: Math.round(
          (totalExclVatCents * versementLiberatoireRateBasisPoints) / 10_000,
        ),
      };
    });

    const cotisationsSocialesCents = rows.reduce((sum, row) => sum + row.cotisationCents, 0);
    const versementLiberatoireCents = rows.reduce(
      (sum, row) => sum + row.versementLiberatoireCents,
      0,
    );

    return {
      applicable: true,
      versementLiberatoireOptIn: company.versementLiberatoireOptIn,
      rows,
      uncategorizedExclVatCents,
      cotisationsSocialesCents,
      versementLiberatoireCents,
      totalEstimatedCents: cotisationsSocialesCents + versementLiberatoireCents,
    };
  }
}

// Phase 1.1-3: findOutstanding now also returns ACOMPTE_VERSE factures —
// still owed, just not for their full amount anymore. This report is HT
// throughout (see this file's class comment), but the deposit itself is
// snapshotted against Total TTC (docs/roadmap.md Phase 1.1-3's own
// decision), so the remaining HT balance is the same *proportion* of the HT
// subtotal that's still unpaid TTC — not a raw cents subtraction, which
// would double-count VAT relief the deposit doesn't actually grant. Floored
// at 0 (an over-recorded deposit must never make "outstanding" negative);
// falls back to the plain subtotal on the zero-total edge case (never
// divides by zero).
function outstandingHtCents(invoice: InvoiceWithTotals): number {
  if (invoice.status !== InvoiceStatus.ACOMPTE_VERSE || !invoice.depositAmountCents) {
    return invoice.subtotalExclVatCents;
  }
  if (invoice.totalInclVatCents <= 0) {
    return invoice.subtotalExclVatCents;
  }
  const remainingRatio = Math.max(
    0,
    (invoice.totalInclVatCents - invoice.depositAmountCents) / invoice.totalInclVatCents,
  );
  return Math.round(invoice.subtotalExclVatCents * remainingRatio);
}

function addToTopEntry(map: Map<string, TopEntry>, label: string, cents: number): void {
  const existing = map.get(label);
  if (existing) {
    existing.totalCents += cents;
    existing.count += 1;
  } else {
    map.set(label, { label, totalCents: cents, count: 1 });
  }
}

function topEntries(map: Map<string, TopEntry>): TopEntry[] {
  return [...map.values()].sort((a, b) => b.totalCents - a.totalCents).slice(0, TOP_ENTRIES_LIMIT);
}

// Phase 1.6 (2026-09-03 revision): a line's revenue counts as "covered" the
// moment it's tied to a real catalog Product/Service, whether or not the
// artisan ever touched that item's own margin field — resolveMarginCents
// already assumes 100% margin for an untouched-but-real catalog item (see
// its own comment), so there's always a resolvable number for it. Only a
// line with NO catalog link at all (freehand, or a MANUAL invoice) has
// truly nothing to go on, and stays uncategorized. `findMarginConfigByIds`
// always returns a row for a real id, whether or not marginMode is set —
// see that method's own comment — so `config != null` alone is the
// correct catalog-link check.
function hasCatalogMarginObject(config: MarginConfig | undefined): boolean {
  return config != null;
}

function addMarginTotal(
  map: Map<string, { revenue: number; margin: number; count: number }>,
  label: string,
  revenueCents: number,
  marginCents: number,
): void {
  const existing = map.get(label);
  if (existing) {
    existing.revenue += revenueCents;
    existing.margin += marginCents;
    existing.count += 1;
  } else {
    map.set(label, { revenue: revenueCents, margin: marginCents, count: 1 });
  }
}

// Sorted by margin, not revenue — unlike topEntries above, the whole point
// of Margin Analytics is "what earns you money," which can rank
// differently from "what sells the most" (see docs/1.6/1.6-2-margin-analytics-backend.md).
function marginTopEntries(
  map: Map<string, { revenue: number; margin: number; count: number }>,
): MarginByEntry[] {
  return [...map.entries()]
    .map(([label, totals]) => ({
      label,
      revenueExclVatCents: totals.revenue,
      marginExclVatCents: totals.margin,
      marginRatePercent: percentOrNull(totals.margin, totals.revenue),
      count: totals.count,
    }))
    .sort((a, b) => b.marginExclVatCents - a.marginExclVatCents)
    .slice(0, TOP_ENTRIES_LIMIT);
}

// null (not 0) when there's nothing to divide by — same convention as
// EInvoicingSnapshot.transmissionRatePercent.
function percentOrNull(partCents: number, totalCents: number): number | null {
  return totalCents > 0 ? Math.round((partCents / totalCents) * 100) : null;
}

function startOfMonthsAgo(from: Date, monthsAgo: number): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - monthsAgo, 1));
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Every month in the window is present, even at 0 — a chart with a gap for
// a quiet month is more misleading than one showing a real zero.
function bucketRevenueByMonth(
  invoices: InvoiceWithTotals[],
  windowStart: Date,
  monthCount: number,
): { month: string; totalExclVatCents: number }[] {
  const totals = new Map<string, number>();
  for (let i = 0; i < monthCount; i++) {
    const month = new Date(
      Date.UTC(windowStart.getUTCFullYear(), windowStart.getUTCMonth() + i, 1),
    );
    totals.set(monthKey(month), 0);
  }
  for (const invoice of invoices) {
    // paidAt is always set here — see getQuarterlyReport's identical comment
    // on findPaidInRange's contract.
    const key = monthKey(invoice.paidAt!);
    totals.set(key, (totals.get(key) ?? 0) + invoice.subtotalExclVatCents);
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, totalExclVatCents]) => ({ month, totalExclVatCents }));
}
