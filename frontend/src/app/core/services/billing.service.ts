import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { BillingStatus } from '../models/billing.model';

@Injectable({ providedIn: 'root' })
export class BillingService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/billing`;

  // App-shell-wide cache: the navbar's "Mon abonnement" button (app.ts)
  // reads this on every page to color itself, not just the subscribe page —
  // one shared signal instead of each consumer fetching its own copy.
  readonly status = signal<BillingStatus | null>(null);

  getStatus(): Observable<BillingStatus> {
    return this.http.get<BillingStatus>(`${this.baseUrl}/status`);
  }

  refreshStatus(): Observable<BillingStatus> {
    return this.getStatus().pipe(tap((status) => this.status.set(status)));
  }

  // Backend returns a Stripe-hosted URL to redirect the browser to — the
  // caller does `window.location.href = url`, there is nothing to render
  // locally for either of these two.
  createCheckoutSession(): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(`${this.baseUrl}/checkout-session`, {});
  }

  createPortalSession(): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(`${this.baseUrl}/portal-session`, {});
  }

  redeemPromoCode(code: string): Observable<{ premiumGrantedUntil: string }> {
    return this.http.post<{ premiumGrantedUntil: string }>(`${this.baseUrl}/redeem-promo`, {
      code,
    });
  }
}
