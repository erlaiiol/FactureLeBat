import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import { InvoiceWithTotals } from '../../core/models/invoice.model';
import { BigButtonComponent } from '../../shared/components/big-button.component';
import { ModalMorphComponent } from '../../shared/components/modal-morph.component';

// Phase 16: opens whenever a card is dropped/moved into "Non payées" and has
// no dueDate yet — "Pour quelle date le client s'est-il engagé à payer ?".
// Skippable (the invoice still moves, just with no overdue tracking until a
// date is set later from the card itself) — see docs/roadmap.md Phase 16.
@Component({
  selector: 'app-invoice-due-date-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BigButtonComponent, ModalMorphComponent],
  templateUrl: './invoice-due-date-modal.component.html',
})
export class InvoiceDueDateModalComponent {
  readonly invoice = input<InvoiceWithTotals | null>(null);
  readonly confirmed = output<string>();
  readonly skipped = output<void>();

  protected readonly dueDate = signal('');
  // See InvoicePreviewModalComponent's identical field for why.
  protected readonly displayedInvoice = signal<InvoiceWithTotals | null>(null);

  constructor() {
    effect(() => {
      const current = this.invoice();
      if (current) {
        this.displayedInvoice.set(current);
      }
    });
  }

  protected onDateInput(value: string): void {
    this.dueDate.set(value);
  }

  protected confirm(): void {
    if (!this.dueDate()) {
      return;
    }
    this.confirmed.emit(this.dueDate());
    this.dueDate.set('');
  }

  protected skip(): void {
    this.skipped.emit();
    this.dueDate.set('');
  }
}
