import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CreateInvoiceRequest, InvoiceWithTotals } from '../models/invoice.model';

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
}
