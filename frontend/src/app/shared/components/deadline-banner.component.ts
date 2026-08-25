import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import {
  daysUntil,
  E_INVOICING_EMISSION_DEADLINE,
  E_INVOICING_RECEPTION_DEADLINE,
} from '../../core/utils/e-invoicing-deadlines.util';

const DISMISS_KEY_PREFIX = 'facturele.dismissedDeadline.';

// Phase 1.3-5 (2026 e-invoicing reform, workflow automation): the same
// deadline-awareness banner Phase 1.2-6 built for company settings, now
// also on the invoice board — the 2026-08-25 review's own finding was that
// a settings-page-only banner is easy to never see again once the artisan
// has visited it once. Reuses the exact same dates/daysUntil util as that
// banner rather than a second copy of the logic.
@Component({
  selector: 'app-deadline-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './deadline-banner.component.html',
})
export class DeadlineBannerComponent {
  protected readonly reception = {
    daysLeft: daysUntil(E_INVOICING_RECEPTION_DEADLINE),
  };
  protected readonly emission = {
    daysLeft: daysUntil(E_INVOICING_EMISSION_DEADLINE),
  };

  private readonly receptionDismissed = signal(this.isDismissed(E_INVOICING_RECEPTION_DEADLINE));
  private readonly emissionDismissed = signal(this.isDismissed(E_INVOICING_EMISSION_DEADLINE));

  // Shown once a deadline is inside 30 days (or already passed — an
  // "échéance dépassée" invoice board is still worth seeing until
  // dismissed, same as the settings-page banner's own tense-aware
  // phrasing) and hasn't been individually dismissed. Keyed per-deadline
  // (not one shared flag) so dismissing reception never also hides
  // emission — they're different deadlines with different consequences.
  protected readonly showReception = computed(
    () => this.reception.daysLeft <= 30 && !this.receptionDismissed(),
  );
  protected readonly showEmission = computed(
    () => this.emission.daysLeft <= 30 && !this.emissionDismissed(),
  );

  protected dismissReception(): void {
    this.setDismissed(E_INVOICING_RECEPTION_DEADLINE);
    this.receptionDismissed.set(true);
  }

  protected dismissEmission(): void {
    this.setDismissed(E_INVOICING_EMISSION_DEADLINE);
    this.emissionDismissed.set(true);
  }

  // Keyed by the deadline's own ISO date, not a single shared flag — if
  // these constants ever change (a later reform amendment), the new date
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
