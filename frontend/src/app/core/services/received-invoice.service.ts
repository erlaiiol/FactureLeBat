import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ReceivedInvoice } from '../models/received-invoice.model';

@Injectable({ providedIn: 'root' })
export class ReceivedInvoiceService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/received-invoices`;

  list(): Observable<ReceivedInvoice[]> {
    return this.http.get<ReceivedInvoice[]>(this.baseUrl);
  }

  // Fetches whatever's new from the connected PA — an explicit action, not
  // automatic on every page load (see backend's own "on-demand, not polled"
  // reasoning, same as invoice transmission-status).
  sync(): Observable<ReceivedInvoice[]> {
    return this.http.post<ReceivedInvoice[]>(`${this.baseUrl}/sync`, {});
  }

  // Plain URL — a real navigation/new-tab open, not fetched via HttpClient,
  // same convention as InvoiceService.pdfUrl/facturXUrl.
  downloadUrl(id: string): string {
    return `${this.baseUrl}/${id}/download`;
  }
}
