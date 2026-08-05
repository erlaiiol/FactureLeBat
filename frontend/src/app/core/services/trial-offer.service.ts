import { Injectable, signal } from '@angular/core';

// Phase 33: a single, app-wide "show the 1er-mois-à-2€ countdown CTA" flag —
// same minimal signal-service shape as PaywallService, deliberately kept
// separate from it rather than folded in: the two modals have different
// trigger conditions (this one only when BillingService.status().trialOffer
// is actually active) and different copy/visuals, so a shared boolean would
// force every caller to also decide which of the two to show.
@Injectable({ providedIn: 'root' })
export class TrialOfferService {
  readonly visible = signal(false);

  show(): void {
    this.visible.set(true);
  }

  dismiss(): void {
    this.visible.set(false);
  }
}
