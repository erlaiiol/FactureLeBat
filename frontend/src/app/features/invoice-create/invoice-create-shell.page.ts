import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter } from 'rxjs';
import { BigButtonComponent } from '../../shared/components/big-button.component';
import { TourAnchorDirective } from '../../shared/tour/tour-anchor.directive';
import { InvoiceTotalsSummaryComponent } from './components/invoice-totals-summary.component';
import { InvoiceDraftStore } from './invoice-draft.store';

// Phase 6 shell: wraps the three routed creation steps (client, lignes,
// apercu) with what must stay visible and reachable from any of them — the
// live running total, both driven off the shared InvoiceDraftStore rather
// than whichever step happens to be mounted. Phase 15: the "Aperçu" button
// no longer fetches a PDF itself (see InvoiceCreatePreviewStepPage) — it's
// just a routerLink into the new mandatory preview step, gated the same way
// it always was (InvoiceDraftStore.canPreview()).
@Component({
  selector: 'app-invoice-create-shell-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    BigButtonComponent,
    InvoiceTotalsSummaryComponent,
    TourAnchorDirective,
  ],
  templateUrl: './invoice-create-shell.page.html',
})
export class InvoiceCreateShellPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly draftStore = inject(InvoiceDraftStore);

  constructor() {
    // Phase 14.3: only when the mode-choice slider actually sent one — a
    // direct/bookmarked entry into `rapide` (no query param) must never
    // silently flip an in-progress devis draft back to FACTURE.
    const type = this.route.snapshot.queryParamMap.get('type');
    if (type === 'DEVIS' || type === 'FACTURE') {
      this.draftStore.setDocumentType(type);
    }
  }

  // Phase 15: hides the bottom bar's own "Aperçu" button while already on
  // the preview step — it would otherwise sit there redundantly next to
  // that screen's "Créer la facture", just re-navigating to where the
  // artisan already is.
  protected readonly onPreviewStep = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
    ),
    { initialValue: null },
  );

  protected isOnPreviewStep(): boolean {
    return (this.onPreviewStep()?.urlAfterRedirects ?? this.router.url).endsWith('/apercu');
  }

  // Phase 15: no longer fetches anything itself — just hands off to the
  // mandatory preview step, which does the actual (JSON) preview call.
  protected goToPreview(): void {
    if (!this.draftStore.canPreview()) {
      return;
    }
    this.router.navigate(['/factures/nouvelle/rapide/apercu']);
  }

  // Lets the artisan bail out of a stuck/unwanted draft instead of being
  // stuck with whatever InvoiceDraftStore persisted to localStorage — a
  // confirm() guard since this discards unsaved input with no undo.
  protected resetDraft(): void {
    if (!window.confirm('Vider tous les champs de cette facture et repartir de zéro ?')) {
      return;
    }
    this.draftStore.reset();
    this.router.navigate(['/factures/nouvelle/rapide/client']);
  }
}
