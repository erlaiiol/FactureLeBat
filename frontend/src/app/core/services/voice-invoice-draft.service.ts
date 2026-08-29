import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { VoiceDraftResponse } from '../models/voice-draft.model';

// Phase 1.4-1 backend can involve a real round-trip to whichever
// DraftResolver is bound (a fuzzy DB search today; an LLM tool loop if
// that engine is ever re-enabled) — bounded the same way
// InvoiceService.previewPdf/downloadPdf bound their own backend round
// trips (PDF_FETCH_TIMEOUT_MS), rather than leaving this call able to
// hang indefinitely on a stalled connection.
const VOICE_DRAFT_TIMEOUT_MS = 20_000;

@Injectable({ providedIn: 'root' })
export class VoiceInvoiceDraftService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/invoices`;

  resolveDraft(transcript: string): Observable<VoiceDraftResponse> {
    return this.http
      .post<VoiceDraftResponse>(`${this.baseUrl}/voice-draft`, { transcript })
      .pipe(timeout(VOICE_DRAFT_TIMEOUT_MS));
  }
}
