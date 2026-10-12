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
  // Which kind of document just got created, so the headline can say "devis"
  // when that's what it was (the offer itself is the same either way).
  readonly documentType = signal<'FACTURE' | 'DEVIS'>('FACTURE');
  // Set by the post-first-invoice trigger only: the guided tour's own
  // "c'est enregistré" step is on screen at that exact moment, and a modal
  // opened on top of it hid the step entirely. The modal component holds
  // back until the tour ends. Never set for the 402 path — that one blocks
  // an action the artisan just attempted and must show immediately.
  readonly waitForTourEnd = signal(false);

  show(options: { documentType?: 'FACTURE' | 'DEVIS'; waitForTourEnd?: boolean } = {}): void {
    this.documentType.set(options.documentType ?? 'FACTURE');
    this.waitForTourEnd.set(options.waitForTourEnd ?? false);
    this.visible.set(true);
  }

  dismiss(): void {
    this.visible.set(false);
    this.waitForTourEnd.set(false);
  }
}
