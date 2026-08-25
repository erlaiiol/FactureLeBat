import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CompanyProfile, UpdateCompanyRequest } from '../models/company.model';

@Injectable({ providedIn: 'root' })
export class CompanyService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/company`;

  // App-shell-wide cache (same reasoning as BillingService.status): the
  // navbar's "Factures reçues" entry (app.ts) needs to know this on every
  // page, not just company-settings — one shared signal kept in sync by
  // every call site below instead of each consumer polling its own copy.
  // null means "not fetched yet this session", not "known disconnected".
  readonly superPdpConnected = signal<boolean | null>(null);

  getProfile(): Observable<CompanyProfile> {
    return this.http.get<CompanyProfile>(this.baseUrl);
  }

  updateProfile(profile: UpdateCompanyRequest): Observable<CompanyProfile> {
    return this.http.patch<CompanyProfile>(this.baseUrl, profile);
  }

  uploadLogo(file: File): Observable<CompanyProfile> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<CompanyProfile>(`${this.baseUrl}/logo`, formData);
  }

  removeLogo(): Observable<CompanyProfile> {
    return this.http.delete<CompanyProfile>(`${this.baseUrl}/logo`);
  }

  // Plain <img src> URL — auth travels via the httpOnly cookie, same as
  // pdfUrl()/getPdfBlob() elsewhere. cacheBust should be bumped by the
  // caller (e.g. Date.now()) right after a successful upload/remove, since
  // GET /company/logo is otherwise cacheable for a few minutes (see
  // CompanyController.serveLogo) and the URL itself never changes.
  logoUrl(cacheBust?: number): string {
    return cacheBust ? `${this.baseUrl}/logo?v=${cacheBust}` : `${this.baseUrl}/logo`;
  }

  // Phase 1.2-4 (2026 e-invoicing reform): whether PA transmission is
  // configured on this deployment at all, and whether this company has
  // completed the OAuth2 consent — gates the "Connecter SUPER PDP"/
  // "Envoyer via PA" UI the same way Stripe's own stripeConfigured flag
  // gates the subscribe page.
  getSuperPdpStatus(): Observable<{ configured: boolean; connected: boolean }> {
    return this.http
      .get<{ configured: boolean; connected: boolean }>(`${this.baseUrl}/super-pdp/status`)
      .pipe(tap((status) => this.superPdpConnected.set(status.connected)));
  }

  // A real browser navigation (window.location), not an HttpClient call —
  // this route 302s straight to SUPER PDP's own consent screen.
  superPdpConnectUrl(): string {
    return `${this.baseUrl}/super-pdp/connect`;
  }

  disconnectSuperPdp(): Observable<{ connected: boolean }> {
    return this.http
      .post<{ connected: boolean }>(`${this.baseUrl}/super-pdp/disconnect`, {})
      .pipe(tap((status) => this.superPdpConnected.set(status.connected)));
  }
}
