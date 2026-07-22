import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MailSettings, UpdateMailSettingsRequest } from '../models/mail-settings.model';

@Injectable({ providedIn: 'root' })
export class MailSettingsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/mail-settings`;

  getSettings(): Observable<MailSettings> {
    return this.http.get<MailSettings>(this.baseUrl);
  }

  // Rejects (backend returns 400) if the SMTP connection can't actually be
  // verified — the caller only ever sees this resolve once it truly works.
  updateSettings(request: UpdateMailSettingsRequest): Observable<MailSettings> {
    return this.http.patch<MailSettings>(this.baseUrl, request);
  }
}
