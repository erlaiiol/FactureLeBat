import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { BillingStatus, PlanCatalog, PlanTier } from '../models/billing.model';

@Injectable({ providedIn: 'root' })
export class BillingService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/billing`;

  // App-shell-wide cache: the navbar's "Mon abonnement" button (app.ts)
  // reads this on every page to color itself, not just the subscribe page —
  // one shared signal instead of each consumer fetching its own copy.
  readonly status = signal<BillingStatus | null>(null);

  // Phase 30: public, no auth — the 3 tier definitions the pricing UI
  // renders. Not cached in a signal like status() above: this rarely
  // changes within a session and every consumer (the pricing cards, any
  // future lock-screen upsell copy) fetches it once on its own.
  getPlans(): Observable<PlanCatalog> {
    return this.http.get<PlanCatalog>(`${this.baseUrl}/plans`);
  }

  getStatus(): Observable<BillingStatus> {
    return this.http.get<BillingStatus>(`${this.baseUrl}/status`);
  }

  refreshStatus(): Observable<BillingStatus> {
    return this.getStatus().pipe(tap((status) => this.status.set(status)));
  }

  // Backend returns a Stripe-hosted URL to redirect the browser to — the
  // caller does `window.location.href = url`, there is nothing to render
  // locally for either of these two.
  createCheckoutSession(tier: PlanTier): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(`${this.baseUrl}/checkout-session`, { tier });
  }

  createPortalSession(): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(`${this.baseUrl}/portal-session`, {});
  }

  redeemPromoCode(
    code: string,
  ): Observable<{ premiumGrantedUntil: string; grantedPlanTier: PlanTier }> {
    return this.http.post<{ premiumGrantedUntil: string; grantedPlanTier: PlanTier }>(
      `${this.baseUrl}/redeem-promo`,
      { code },
    );
  }
}
