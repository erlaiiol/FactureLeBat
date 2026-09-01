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

  // Same app-shell-wide cache reasoning as superPdpConnected above —
  // QuantityWheelPickerComponent (one instance per line item) reads this on
  // every sheet open, not just company-settings.page.ts. null means "not
  // fetched yet this session", treated as "molette" (the original default)
  // rather than "clavier" everywhere it's read.
  readonly preferKeyboardQuantityInput = signal<boolean | null>(null);

  getProfile(): Observable<CompanyProfile> {
    return this.http
      .get<CompanyProfile>(this.baseUrl)
      .pipe(
        tap((profile) => this.preferKeyboardQuantityInput.set(profile.preferKeyboardQuantityInput)),
      );
  }

  updateProfile(profile: UpdateCompanyRequest): Observable<CompanyProfile> {
    return this.http
      .patch<CompanyProfile>(this.baseUrl, profile)
      .pipe(
        tap((updated) => this.preferKeyboardQuantityInput.set(updated.preferKeyboardQuantityInput)),
      );
  }

  // Own lightweight endpoint, deliberately not routed through updateProfile
  // above — same reasoning as TourService.setTourEnabled: the picker only
  // ever has this one field to send, never the rest of the required profile
  // shape UpdateCompanyRequest carries. Returns the request rather than
  // subscribing internally so each caller (the picker, company-settings.page)
  // can surface its own success/failure feedback.
  updateQuantityInputMode(preferKeyboardQuantityInput: boolean): Observable<CompanyProfile> {
    return this.http
      .patch<CompanyProfile>(`${this.baseUrl}/quantity-input-mode`, {
        preferKeyboardQuantityInput,
      })
      .pipe(
        tap((updated) => this.preferKeyboardQuantityInput.set(updated.preferKeyboardQuantityInput)),
      );
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
