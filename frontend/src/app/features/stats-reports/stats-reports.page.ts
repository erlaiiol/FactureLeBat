import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  ActivityAnalytics,
  CATEGORY_LABELS,
  QuarterlyReport,
} from '../../core/models/report.model';
import { CompanyService } from '../../core/services/company.service';
import { ReportsService } from '../../core/services/reports.service';
import { BigButtonComponent } from '../../shared/components/big-button.component';
import { RevenueBarChartComponent } from '../../shared/components/revenue-bar-chart.component';
import { CentsToEurosPipe } from '../../shared/pipes/cents-to-euros.pipe';
import { TourAnchorDirective } from '../../shared/tour/tour-anchor.directive';
import { delayedSkeleton } from '../../shared/utils/delayed-skeleton';
import {
  dateInputValue,
  endOfDayFromInput,
  periodLabel,
  periodRange,
  PeriodMode,
  shiftPeriod,
  startOfDayFromInput,
} from './report-period.util';

type StatsReportsTab = 'apercu' | 'rapport';

// Merges the former standalone "Statistiques" and "Rapports" nav tabs into
// one page (two views over the same ReportsService/ReportsModule — see both
// pages' previous history in git). Kept as a single in-page tab switcher
// rather than two routes so the two views read as one coherent "how's my
// business doing" destination instead of scattering related numbers across
// two clicks; the guided tour (see tour-definitions.ts's 'stats-reports')
// is what carries a new artisan through both halves and spells out which
// figures are indicative estimates vs. what actually counts for URSSAF.
@Component({
  selector: 'app-stats-reports-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CentsToEurosPipe,
    DatePipe,
    RevenueBarChartComponent,
    TourAnchorDirective,
    BigButtonComponent,
  ],
  templateUrl: './stats-reports.page.html',
})
export class StatsReportsPage {
  private readonly reportsService = inject(ReportsService);
  private readonly companyService = inject(CompanyService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  // Driven by the ?vue= query param rather than a plain local signal — the
  // 'stats-reports' guided tour (see tour-definitions.ts) needs a real,
  // reachable-by-URL state to switch into on a step's behalf (its `route`),
  // exactly like every route-based tour transition elsewhere in the app.
  // A local-only signal has no equivalent TourService could drive when the
  // artisan advances the tour via "Suivant" instead of physically clicking
  // the tab. '/rapports' redirects here with ?vue=rapport so a bookmark/old
  // link still lands directly on the declaration tab.
  protected readonly tab = signal<StatsReportsTab>('apercu');

  protected setTab(tab: StatsReportsTab): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { vue: tab === 'rapport' ? 'rapport' : null },
      queryParamsHandling: 'merge',
    });
  }

  // --- Vue d'ensemble (former StatisticsPage) ---

  protected readonly analytics = signal<ActivityAnalytics | null>(null);
  protected readonly analyticsLoading = signal(true);
  protected readonly analyticsShowSkeleton = delayedSkeleton(this.analyticsLoading);
  protected readonly analyticsError = signal(false);
  // Phase 30: analytics is Pro+/Premium-only (see PlanFeatureLockedException)
  // — distinct from analyticsError so the tab shows an upsell CTA instead of
  // a generic "couldn't load" message when that's actually what happened.
  protected readonly analyticsLocked = signal(false);

  // --- Rapport & déclaration (former ReportsPage) ---

  protected readonly categoryLabels = CATEGORY_LABELS;

  protected readonly mode = signal<PeriodMode>('quarter');
  protected readonly customMode = signal(false);
  protected readonly referenceDate = signal(new Date());
  protected readonly customFrom = signal(dateInputValue(periodRange('quarter', new Date()).from));
  protected readonly customTo = signal(dateInputValue(periodRange('quarter', new Date()).to));

  protected readonly report = signal<QuarterlyReport | null>(null);
  protected readonly reportLoading = signal(true);
  protected readonly reportShowSkeleton = delayedSkeleton(this.reportLoading);
  protected readonly reportErrorMessage = signal<string | null>(null);

  private readonly range = computed(() => {
    if (this.customMode()) {
      return {
        from: startOfDayFromInput(this.customFrom()),
        to: endOfDayFromInput(this.customTo()),
      };
    }
    return periodRange(this.mode(), this.referenceDate());
  });

  protected readonly periodLabel = computed(() =>
    this.customMode() ? 'Période personnalisée' : periodLabel(this.mode(), this.referenceDate()),
  );

  protected readonly downloadPdfUrl = computed(() => {
    const { from, to } = this.range();
    return this.reportsService.quarterlyPdfUrl(from.toISOString(), to.toISOString());
  });

  protected readonly downloadCsvUrl = computed(() => {
    const { from, to } = this.range();
    return this.reportsService.quarterlyCsvUrl(from.toISOString(), to.toISOString());
  });

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.tab.set(params.get('vue') === 'rapport' ? 'rapport' : 'apercu');
    });

    this.reportsService
      .getActivityAnalytics()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (analytics) => {
          this.analyticsLoading.set(false);
          this.analytics.set(analytics);
        },
        error: (error: unknown) => {
          this.analyticsLoading.set(false);
          const body =
            error instanceof HttpErrorResponse ? (error.error as { error?: string } | null) : null;
          if (
            error instanceof HttpErrorResponse &&
            error.status === 402 &&
            body?.error === 'PlanFeatureLocked'
          ) {
            this.analyticsLocked.set(true);
          } else {
            this.analyticsError.set(true);
          }
        },
      });

    // Preselects the artisan's own declared cadence — the report itself
    // still accepts any custom range regardless of this default.
    this.companyService
      .getProfile()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (profile) => {
          this.mode.set(profile.declarationFrequency === 'MENSUELLE' ? 'month' : 'quarter');
          this.loadReport();
        },
        error: () => this.loadReport(),
      });
  }

  protected goToSubscribe(): void {
    void this.router.navigateByUrl('/abonnement');
  }

  // Phase 1.1-1: jumps to "Mes documents" pre-filtered to exactly the
  // factures counted by unsignedFactureCount — same répertoire-style
  // query-param filter InvoiceBoardPage already reads for the
  // client/product/service/discount "Documents" entry points.
  protected goToUnsignedFactures(): void {
    void this.router.navigate(['/factures'], { queryParams: { unsigned: '1' } });
  }

  protected previousPeriod(): void {
    this.referenceDate.update((date) => shiftPeriod(this.mode(), date, -1));
    this.loadReport();
  }

  protected nextPeriod(): void {
    this.referenceDate.update((date) => shiftPeriod(this.mode(), date, 1));
    this.loadReport();
  }

  protected toggleCustomMode(): void {
    this.customMode.update((value) => !value);
    if (!this.customMode()) {
      this.loadReport();
    }
  }

  protected onCustomFromInput(value: string): void {
    this.customFrom.set(value);
  }

  protected onCustomToInput(value: string): void {
    this.customTo.set(value);
  }

  protected applyCustomRange(): void {
    this.loadReport();
  }

  protected plafondBarWidth(): string {
    const warning = this.report()?.plafondWarning;
    if (!warning) {
      return '0%';
    }
    return `${Math.min(100, warning.percentageUsed)}%`;
  }

  private loadReport(): void {
    const { from, to } = this.range();
    this.reportLoading.set(true);
    this.reportErrorMessage.set(null);
    this.reportsService
      .getQuarterlyReport(from.toISOString(), to.toISOString())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (report) => {
          this.reportLoading.set(false);
          this.report.set(report);
        },
        error: () => {
          this.reportLoading.set(false);
          this.reportErrorMessage.set('Impossible de charger le rapport pour le moment.');
        },
      });
  }
}
