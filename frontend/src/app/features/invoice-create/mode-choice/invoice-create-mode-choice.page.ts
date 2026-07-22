import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TourAnchorDirective } from '../../../shared/tour/tour-anchor.directive';

// Phase 9.5: the first screen of "nouvelle facture" — picks between mode
// rapide (today's step-based, catalog-driven flow) and mode manuel (the
// free-form PDF-like canvas). Purely navigational: each mode owns its own
// draft store, so choosing one here never touches the other's state.
@Component({
  selector: 'app-invoice-create-mode-choice-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TourAnchorDirective],
  templateUrl: './invoice-create-mode-choice.page.html',
})
export class InvoiceCreateModeChoicePage {}
