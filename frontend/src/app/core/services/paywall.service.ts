import { Injectable, signal } from '@angular/core';

// Phase 14: a single, app-wide "you've hit the free-trial wall" flag.
// Triggered from wherever a 402 PremiumRequired response can actually occur
// (today: the invoice shell's "Aperçu" and the lines-step's "Créer la
// facture", see invoice-create-shell.page.ts/invoice-create-lines-step.page.ts)
// rather than a route guard — the roadmap's own "frustrate at the last
// moment" call means every screen up to that point must stay fully usable
// regardless of subscription status, so there is nothing to gate on
// navigation, only on the specific actions that can actually be refused.
@Injectable({ providedIn: 'root' })
export class PaywallService {
  readonly visible = signal(false);

  show(): void {
    this.visible.set(true);
  }

  dismiss(): void {
    this.visible.set(false);
  }
}
