import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { InvoiceWithTotals } from '../../core/models/invoice.model';
import { CentsToEurosPipe } from '../../shared/pipes/cents-to-euros.pipe';

// Phase 16: for every devis not yet converted to a facture, a lightweight
// CTA card sits in "Non payées" alongside real facture cards — decided
// explicitly with the user (diverging from the roadmap's original "devis
// stay in their own simpler list" draft): a devis is conceptually a
// "pré-facture", so its eventual facture's slot is visible before it even
// exists. Never draggable — it has no status of its own, only an action.
@Component({
  selector: 'app-invoice-ghost-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CentsToEurosPipe],
  templateUrl: './invoice-ghost-card.component.html',
})
export class InvoiceGhostCardComponent {
  readonly devis = input.required<InvoiceWithTotals>();
  readonly converting = input(false);
  readonly createFacture = output<void>();
}
