import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  daysUntil,
  E_INVOICING_EMISSION_DEADLINE,
} from '../../core/utils/e-invoicing-deadlines.util';

const DISMISS_KEY_PREFIX = 'facturele.dismissedDeadline.';

// Phase 1.3-5 (2026 e-invoicing reform, workflow automation): the same
// deadline-awareness banner Phase 1.2-6 built for company settings, now
// also on the invoice board — the 2026-08-25 review's own finding was that
// a settings-page-only banner is easy to never see again once the artisan
// has visited it once. Reuses the exact same dates/daysUntil util as that
// banner rather than a second copy of the logic.
//
// Emission-only here (2026-08-30): reception is a one-time SUPER PDP
// connection, not an ongoing task, and this app's whole identity is about
// emitting invoices fast — surfacing reception with equal weight on the
// core "make an invoice" screen overstated it. Reception still gets its
// full explanation on the company-settings page, where the SUPER PDP
// connection itself lives.
@Component({
  selector: 'app-deadline-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './deadline-banner.component.html',
})
export class DeadlineBannerComponent {
  protected readonly emission = {
    daysLeft: daysUntil(E_INVOICING_EMISSION_DEADLINE),
  };

  private readonly emissionDismissed = signal(this.isDismissed(E_INVOICING_EMISSION_DEADLINE));

  // Shown once the deadline is inside 30 days (or already passed — an
  // "échéance dépassée" invoice board is still worth seeing until
  // dismissed) and hasn't been dismissed.
  protected readonly showEmission = computed(
    () => this.emission.daysLeft <= 30 && !this.emissionDismissed(),
  );

  protected dismissEmission(): void {
    this.setDismissed(E_INVOICING_EMISSION_DEADLINE);
    this.emissionDismissed.set(true);
  }

  // Keyed by the deadline's own ISO date, not a single shared flag — if
  // this constant ever changes (a later reform amendment), the new date
  // naturally reappears as undismissed instead of inheriting an old
  // dismissal it was never actually shown for.
  private storageKey(deadlineIso: string): string {
    return `${DISMISS_KEY_PREFIX}${deadlineIso}`;
  }

  private isDismissed(deadlineIso: string): boolean {
    try {
      return localStorage.getItem(this.storageKey(deadlineIso)) !== null;
    } catch {
      return false;
    }
  }

  private setDismissed(deadlineIso: string): void {
    try {
      localStorage.setItem(this.storageKey(deadlineIso), '1');
    } catch {
      // Best-effort — private browsing/blocked storage just means the
      // banner reappears next visit, never a crash.
    }
  }
}
