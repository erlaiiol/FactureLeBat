import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ReferralStatus } from '../models/referral.model';

@Injectable({ providedIn: 'root' })
export class ReferralService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/referral`;

  getStatus(): Observable<ReferralStatus> {
    return this.http.get<ReferralStatus>(`${this.baseUrl}/me`, { withCredentials: true });
  }

  // Public endpoint, no credentials needed — used to give live feedback on
  // the registration screen before the account even exists.
  validateCode(code: string): Observable<{ valid: boolean }> {
    return this.http.get<{ valid: boolean }>(
      `${this.baseUrl}/validate/${encodeURIComponent(code)}`,
    );
  }
}
