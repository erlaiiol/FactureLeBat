import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { InvoiceWithTotals } from '../../core/models/invoice.model';
import { InvoiceService } from '../../core/services/invoice.service';
import { BigButtonComponent } from '../../shared/components/big-button.component';

// Retroactive devis creation: opened from a facture row's "Créer un devis"
// action (or the preview modal's equivalent), for an artisan who forgot to
// make the devis before issuing the facture — an untouched clone, same
// shape as InvoiceBoardPage.convertDevis's "Facture identique", just the
// other direction (see InvoiceService.convertToDevis on the backend).
// Pre-fills the number with the same "next devis" suggestion used
// everywhere else (InvoiceService.getNextNumber), editable before
// confirming so it never collides with an existing document — the backend
// re-validates uniqueness regardless (see errorMessage below).
@Component({
  selector: 'app-create-devis-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BigButtonComponent],
  templateUrl: './create-devis-modal.component.html',
})
export class CreateDevisModalComponent {
  private readonly invoiceService = inject(InvoiceService);
  private readonly destroyRef = inject(DestroyRef);

  readonly invoice = input<InvoiceWithTotals | null>(null);
  readonly closed = output<void>();
  readonly created = output<InvoiceWithTotals>();

  protected readonly number = signal('');
  protected readonly suggestionLoading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  constructor() {
    // Re-loads whenever a different facture opens the modal (the modal
    // instance is reused across rows, not recreated per invoice) — same
    // "effect on the invoice input" convention as SendInvoiceEmailModal.
    effect(() => {
      const invoice = this.invoice();
      if (!invoice) {
        return;
      }
      this.number.set('');
      this.errorMessage.set(null);
      this.suggestionLoading.set(true);

      this.invoiceService
        .getNextNumber('DEVIS')
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (response) => {
            this.suggestionLoading.set(false);
            this.number.set(response.number);
          },
          error: () => {
            this.suggestionLoading.set(false);
          },
        });
    });
  }

  protected onNumberInput(value: string): void {
    this.number.set(value);
  }

  protected confirm(): void {
    const invoice = this.invoice();
    if (!invoice || !this.number().trim() || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);

    this.invoiceService
      .convertToDevis(invoice.id, this.number().trim())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (devis) => {
          this.submitting.set(false);
          this.created.emit(devis);
        },
        error: (error: HttpErrorResponse) => {
          this.submitting.set(false);
          this.errorMessage.set(
            typeof error.error?.message === 'string'
              ? error.error.message
              : 'Impossible de créer le devis pour le moment.',
          );
        },
      });
  }

  protected close(): void {
    this.closed.emit();
  }
}
