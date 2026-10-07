import { HttpTestingController } from '@angular/common/http/testing';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter, RouterLink } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { environment } from '../../../environments/environment';
import { QuarterlyReport } from '../../core/models/report.model';
import { BigButtonComponent } from '../../shared/components/big-button.component';
import { CentsToEurosPipe } from '../../shared/pipes/cents-to-euros.pipe';
import {
  createNativeShellDoubles,
  flushAsync,
  nativeShellProviders,
  pdfBlob,
  startNativeShell,
  tap,
} from '../../testing/native-shell-testing';
import { StatsReportsPage } from './stats-reports.page';

// Statistiques → Rapport → Télécharger le PDF / Exporter en CSV, inside the
// Android/iOS shell: both must go through the app (cookie included), never
// leave the WebView. Charts and the tour anchor are dropped from the
// template's imports — irrelevant here, and the charts need a real canvas.
describe('StatsReportsPage — report exports in the native shell', () => {
  const REPORTS_URL = `${environment.apiBaseUrl}/reports`;

  const report: QuarterlyReport = {
    from: '2026-07-01T00:00:00.000Z',
    to: '2026-09-30T23:59:59.999Z',
    totalExclVatCents: 0,
    byCategory: [],
    invoices: [],
    plafondWarning: null,
    estimatedCharges: {
      applicable: false,
      versementLiberatoireOptIn: false,
      rows: [],
      uncategorizedExclVatCents: 0,
      cotisationsSocialesCents: 0,
      versementLiberatoireCents: 0,
      totalEstimatedCents: 0,
    },
  };

  async function renderReportTab() {
    const doubles = createNativeShellDoubles();
    TestBed.configureTestingModule({
      providers: [
        ...nativeShellProviders(doubles.nativeShare, doubles.toast),
        provideRouter([{ path: 'statistiques', component: StatsReportsPage }]),
      ],
    });
    TestBed.overrideComponent(StatsReportsPage, {
      set: {
        imports: [CentsToEurosPipe, DatePipe, BigButtonComponent, RouterLink],
        schemas: [CUSTOM_ELEMENTS_SCHEMA],
      },
    });
    const http = startNativeShell();
    const harness = await RouterTestingHarness.create('/statistiques?vue=rapport');

    // Only the quarterly report matters here; every other startup call
    // (analytics, margin, e-invoicing snapshot, company profile) just fails,
    // which the page already handles on its own.
    // The quarterly request itself only goes out once those have settled.
    for (let pass = 0; pass < 3; pass++) {
      http
        .match((request) => request.url === `${REPORTS_URL}/quarterly`)
        .forEach((request) => request.flush(report));
      http
        .match(() => true)
        .forEach((request) => request.flush(null, { status: 500, statusText: 'Server Error' }));
      harness.detectChanges();
      await flushAsync();
    }

    const link = (text: string) =>
      Array.from((harness.routeNativeElement as HTMLElement).querySelectorAll('a')).find((a) =>
        a.textContent?.includes(text),
      )!;
    return { ...doubles, http, link };
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('downloads the quarterly PDF through the app', async () => {
    const { http, nativeShare, link } = await renderReportTab();

    const event = tap(link('Télécharger le PDF'));

    expect(event.defaultPrevented).toBe(true);
    http
      .expectOne((request) => request.url.startsWith(`${REPORTS_URL}/quarterly/pdf?`))
      .flush(pdfBlob());
    await flushAsync();
    expect(nativeShare.share).toHaveBeenCalledTimes(1);
  });

  it('downloads the CSV export through the app', async () => {
    const { http, nativeShare, link } = await renderReportTab();

    const event = tap(link('Exporter en CSV'));

    expect(event.defaultPrevented).toBe(true);
    http
      .expectOne((request) => request.url.startsWith(`${REPORTS_URL}/quarterly/csv?`))
      .flush(new Blob(['a;b'], { type: 'text/csv' }), {
        headers: { 'Content-Disposition': 'attachment; filename="rapport-T3.csv"' },
      });
    await flushAsync();
    expect(nativeShare.share).toHaveBeenCalledWith(expect.any(Blob), 'rapport-T3.csv');
  });
});
