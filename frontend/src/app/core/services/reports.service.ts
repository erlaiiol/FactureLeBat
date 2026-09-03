import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ActivityAnalytics,
  EInvoicingSnapshot,
  MarginAnalytics,
  QuarterlyReport,
} from '../models/report.model';

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/reports`;

  getQuarterlyReport(from: string, to: string): Observable<QuarterlyReport> {
    return this.http.get<QuarterlyReport>(`${this.baseUrl}/quarterly`, { params: { from, to } });
  }

  // Both downloads are plain GETs carried by the auth cookie (same pattern
  // as InvoiceService.pdfUrl) — no need to fetch a Blob just to trigger a
  // browser download.
  quarterlyPdfUrl(from: string, to: string): string {
    return `${this.baseUrl}/quarterly/pdf?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  }

  quarterlyCsvUrl(from: string, to: string): string {
    return `${this.baseUrl}/quarterly/csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  }

  getActivityAnalytics(): Observable<ActivityAnalytics> {
    return this.http.get<ActivityAnalytics>(`${this.baseUrl}/analytics`);
  }

  // Phase 1.3-6 (2026 e-invoicing reform, workflow automation): deliberately
  // NOT behind the same premium gate as getActivityAnalytics — see
  // StatsReportsPage's own comment.
  getEInvoicingSnapshot(): Observable<EInvoicingSnapshot> {
    return this.http.get<EInvoicingSnapshot>(`${this.baseUrl}/e-invoicing-snapshot`);
  }

  // Phase 1.6: same premium gate as getActivityAnalytics — see
  // StatsReportsPage's own comment.
  getMarginAnalytics(): Observable<MarginAnalytics> {
    return this.http.get<MarginAnalytics>(`${this.baseUrl}/margin`);
  }
}
