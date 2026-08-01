import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CreateInvoiceRequest,
  DocumentType,
  InvoiceMailTemplate,
  InvoiceWithTotals,
  NextNumberResponse,
  SendInvoiceEmailRequest,
  UpdateInvoiceStatusRequest,
} from '../models/invoice.model';

// Generating a PDF (server render, then downloading the blob) has no
// built-in HttpClient timeout — without one, a slow/stalled connection
// (a bad mobile network, a stuck backend) leaves the preview modal spinning
// forever with no way for the artisan to tell "still working" from "broken".
// Bounding it turns that silent hang into a surfaced, retryable error — see
// PdfPreviewModalComponent/InvoicePreviewModalComponent's loading state.
const PDF_FETCH_TIMEOUT_MS = 20_000;

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

  // Blob counterpart of pdfUrl, for embedding a saved invoice/devis in an
  // <iframe> (see InvoicePreviewModalComponent) — the CSP's
  // `frame-src 'self' blob:` won't allow framing the API's own origin
  // directly in dev (different port), only a blob: URL the frontend created
  // itself.
  getPdfBlob(id: string): Observable<Blob> {
    return this.http
      .get(this.pdfUrl(id), { responseType: 'blob' })
      .pipe(timeout(PDF_FETCH_TIMEOUT_MS));
  }

  // Phase 6: renders a PDF from a not-yet-saved draft — same request shape
  // as create(), but nothing is persisted server-side (see
  // InvoiceService.previewPdf on the backend).
  previewPdf(request: CreateInvoiceRequest): Observable<Blob> {
    return this.http
      .post(`${this.baseUrl}/preview`, request, { responseType: 'blob' })
      .pipe(timeout(PDF_FETCH_TIMEOUT_MS));
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

  // Phase 14.3: turns a devis into a real, independently-numbered facture —
  // see InvoiceService.convertToFacture on the backend.
  convertToFacture(devisId: string): Observable<InvoiceWithTotals> {
    return this.http.post<InvoiceWithTotals>(`${this.baseUrl}/${devisId}/convert-to-facture`, {});
  }

  // Phase 16: the board's drag/button status changes, and a due-date-only
  // edit from an existing card (same status, new dueDate).
  updateStatus(id: string, request: UpdateInvoiceStatusRequest): Observable<InvoiceWithTotals> {
    return this.http.patch<InvoiceWithTotals>(`${this.baseUrl}/${id}/status`, request);
  }

  // Phase 27: the suggested "numéro" — the highest number this company has
  // ever used for this document type, plus one — pre-filled on the apercu
  // step (mode rapide) and the manual canvas, freely editable from there.
  getNextNumber(documentType: DocumentType): Observable<NextNumberResponse> {
    return this.http.get<NextNumberResponse>(`${this.baseUrl}/next-number`, {
      params: { documentType },
    });
  }
}
