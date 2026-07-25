import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CreateInvoiceRequest,
  InvoiceMailTemplate,
  InvoiceWithTotals,
  SendInvoiceEmailRequest,
} from '../models/invoice.model';

@Injectable({ providedIn: 'root' })
export class InvoiceService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/invoices`;

  create(request: CreateInvoiceRequest): Observable<InvoiceWithTotals> {
    return this.http.post<InvoiceWithTotals>(this.baseUrl, request);
  }

  list(): Observable<InvoiceWithTotals[]> {
    return this.http.get<InvoiceWithTotals[]>(this.baseUrl);
  }

  getById(id: string): Observable<InvoiceWithTotals> {
    return this.http.get<InvoiceWithTotals>(`${this.baseUrl}/${id}`);
  }

  pdfUrl(id: string): string {
    return `${this.baseUrl}/${id}/pdf`;
  }

  // Phase 6: renders a PDF from a not-yet-saved draft — same request shape
  // as create(), but nothing is persisted server-side (see
  // InvoiceService.previewPdf on the backend).
  previewPdf(request: CreateInvoiceRequest): Observable<Blob> {
    return this.http.post(`${this.baseUrl}/preview`, request, { responseType: 'blob' });
  }

  // Phase 15: JSON counterpart of previewPdf — same not-yet-saved draft,
  // but the computed figures (per-line totals, billed quantity, VAT) as
  // structured data, for the mandatory preview screen's HTML mirror.
  previewData(request: CreateInvoiceRequest): Observable<InvoiceWithTotals> {
    return this.http.post<InvoiceWithTotals>(`${this.baseUrl}/preview-data`, request);
  }

  // Phase 12: sends the invoice PDF by email through the artisan's own
  // configured SMTP account — returns the invoice with sentAt/sentToEmail
  // updated on success.
  sendEmail(id: string, request: SendInvoiceEmailRequest): Observable<InvoiceWithTotals> {
    return this.http.post<InvoiceWithTotals>(`${this.baseUrl}/${id}/send-email`, request);
  }

  getMailTemplate(id: string): Observable<InvoiceMailTemplate> {
    return this.http.get<InvoiceMailTemplate>(`${this.baseUrl}/${id}/mail-template`);
  }
}
