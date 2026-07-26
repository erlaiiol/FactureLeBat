import { Controller, Get, Header, Query, StreamableFile } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { CompanyService } from '../company/company.service';
import { PdfService } from '../invoice/pdf/pdf.service';
import { CATEGORY_LABELS } from './activity-category.util';
import { buildQuarterlyReportCsv } from './csv.util';
import { ReportPeriodQueryDto } from './dto/report-period-query.dto';
import { ActivityAnalytics, QuarterlyReport } from './entities/report.entity';
import { ReportsService } from './reports.service';

// Phase 17: no premium gate — decided explicitly with the user, unlike
// InvoiceService's per-invoice gate (see PremiumGateService). An artisan
// must be able to produce their own turnover declaration regardless of
// subscription status.
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly pdfService: PdfService,
    private readonly companyService: CompanyService,
  ) {}

  @Get('quarterly')
  getQuarterly(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReportPeriodQueryDto,
  ): Promise<QuarterlyReport> {
    return this.reportsService.getQuarterlyReport(
      user.companyId,
      new Date(query.from),
      new Date(query.to),
    );
  }

  @Get('quarterly/pdf')
  @Header('Content-Type', 'application/pdf')
  async getQuarterlyPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReportPeriodQueryDto,
  ): Promise<StreamableFile> {
    const [report, company] = await Promise.all([
      this.reportsService.getQuarterlyReport(
        user.companyId,
        new Date(query.from),
        new Date(query.to),
      ),
      this.companyService.getProfile(user.companyId),
    ]);
    const buffer = await this.pdfService.generateReportPdf({
      issuerName: company.name,
      periodLabel: `${new Date(report.from).toLocaleDateString('fr-FR')} au ${new Date(report.to).toLocaleDateString('fr-FR')}`,
      totalExclVatCents: report.totalExclVatCents,
      categories: report.byCategory.map((entry) => ({
        label: CATEGORY_LABELS[entry.category],
        totalExclVatCents: entry.totalExclVatCents,
      })),
      invoices: report.invoices,
      plafondWarning: report.plafondWarning,
      estimatedCharges: {
        applicable: report.estimatedCharges.applicable,
        versementLiberatoireOptIn: report.estimatedCharges.versementLiberatoireOptIn,
        rows: report.estimatedCharges.rows.map((entry) => ({
          label: CATEGORY_LABELS[entry.category],
          totalExclVatCents: entry.totalExclVatCents,
          cotisationRatePercent: `${(entry.cotisationRateBasisPoints / 100).toFixed(2)} %`,
          cotisationCents: entry.cotisationCents,
        })),
        cotisationsSocialesCents: report.estimatedCharges.cotisationsSocialesCents,
        versementLiberatoireCents: report.estimatedCharges.versementLiberatoireCents,
        totalEstimatedCents: report.estimatedCharges.totalEstimatedCents,
        uncategorizedExclVatCents: report.estimatedCharges.uncategorizedExclVatCents,
      },
    });
    return new StreamableFile(buffer, {
      disposition: `attachment; filename="rapport-${query.from}-${query.to}.pdf"`,
    });
  }

  @Get('quarterly/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async getQuarterlyCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReportPeriodQueryDto,
  ): Promise<StreamableFile> {
    const report = await this.reportsService.getQuarterlyReport(
      user.companyId,
      new Date(query.from),
      new Date(query.to),
    );
    const csv = buildQuarterlyReportCsv(report);
    return new StreamableFile(Buffer.from(csv, 'utf-8'), {
      disposition: `attachment; filename="rapport-${query.from}-${query.to}.csv"`,
    });
  }

  @Get('analytics')
  getAnalytics(@CurrentUser() user: AuthenticatedUser): Promise<ActivityAnalytics> {
    return this.reportsService.getActivityAnalytics(user.companyId);
  }
}
