import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DocumentType } from '../../../core/models/invoice.model';
import { TourAnchorDirective } from '../../../shared/tour/tour-anchor.directive';

// Phase 9.5: the first screen of "nouvelle facture" — picks between mode
// rapide (today's step-based, catalog-driven flow) and mode manuel (the
// free-form PDF-like canvas). Purely navigational: each mode owns its own
// draft store, so choosing one here never touches the other's state.
//
// Phase 14.3: also picks Devis/Facture, independently of the mode choice
// above — a devis is mechanically a facture, so this is just carried along
// as a query param on whichever mode link is clicked (`?type=...`), read
// once by that mode's draft store at construction. Still purely
// navigational: nothing about the choice is persisted here.
@Component({
  selector: 'app-invoice-create-mode-choice-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TourAnchorDirective],
  templateUrl: './invoice-create-mode-choice.page.html',
})
export class InvoiceCreateModeChoicePage {
  protected readonly documentType = signal<DocumentType>('FACTURE');

  protected selectDocumentType(type: DocumentType): void {
    this.documentType.set(type);
  }
}
