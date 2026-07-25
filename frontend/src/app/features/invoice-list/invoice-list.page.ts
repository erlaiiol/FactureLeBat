import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DocumentType, InvoiceWithTotals } from '../../core/models/invoice.model';
import { InvoiceService } from '../../core/services/invoice.service';
import { CentsToEurosPipe } from '../../shared/pipes/cents-to-euros.pipe';
import { SendInvoiceEmailModalComponent } from './send-invoice-email-modal.component';

// Phase 14.3: "Tous" alongside the two real DocumentType values — not a
// third persisted state, purely a client-side filter over the list already
// loaded (no server-side pagination on this endpoint to filter through).
type DocumentTypeFilter = DocumentType | 'TOUS';

const FILTER_OPTIONS: ReadonlyArray<{ value: DocumentTypeFilter; label: string }> = [
  { value: 'TOUS', label: 'Tous' },
  { value: 'DEVIS', label: 'Devis' },
  { value: 'FACTURE', label: 'Facture' },
];

@Component({
  selector: 'app-invoice-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CentsToEurosPipe, DatePipe, SendInvoiceEmailModalComponent],
  templateUrl: './invoice-list.page.html',
})
export class InvoiceListPage {
  private readonly invoiceService = inject(InvoiceService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly invoices = signal<InvoiceWithTotals[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly emailModalInvoice = signal<InvoiceWithTotals | null>(null);

  protected readonly filterOptions = FILTER_OPTIONS;
  protected readonly filter = signal<DocumentTypeFilter>('TOUS');
  protected readonly filteredInvoices = computed(() => {
    const filter = this.filter();
    return filter === 'TOUS'
      ? this.invoices()
      : this.invoices().filter((invoice) => invoice.documentType === filter);
  });

  // Phase 14.3: which devis row is mid-conversion — disables just that row's
  // button rather than the whole list.
  protected readonly convertingId = signal<string | null>(null);

  constructor() {
    this.invoiceService
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (invoices) => {
          this.invoices.set(invoices);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.errorMessage.set('Impossible de charger vos factures. Veuillez réessayer.');
        },
      });
  }

  protected setFilter(filter: DocumentTypeFilter): void {
    this.filter.set(filter);
  }

  protected pdfUrl(invoiceId: string): string {
    return this.invoiceService.pdfUrl(invoiceId);
  }

  // Phase 14.3: usable on any devis row, any time — not only right after
  // creation (see docs/roadmap.md Phase 14.3). Same behavior as
  // InvoiceCreatePreviewStepPage.convertToFacture: adds the new facture to
  // the list and patches the devis row's own convertedToFacture in place,
  // rather than a full reload.
  protected convertToFacture(devis: InvoiceWithTotals): void {
    if (this.convertingId()) {
      return;
    }
    this.convertingId.set(devis.id);
    this.errorMessage.set(null);
    this.invoiceService
      .convertToFacture(devis.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (facture) => {
          this.convertingId.set(null);
          this.invoices.update((invoices) => [
            facture,
            ...invoices.map((invoice) =>
              invoice.id === devis.id
                ? { ...invoice, convertedToFacture: { id: facture.id, number: facture.number } }
                : invoice,
            ),
          ]);
        },
        error: () => {
          this.convertingId.set(null);
          this.errorMessage.set('Impossible de créer la facture pour le moment.');
        },
      });
  }

  protected openEmailModal(invoice: InvoiceWithTotals): void {
    this.emailModalInvoice.set(invoice);
  }

  protected closeEmailModal(): void {
    this.emailModalInvoice.set(null);
  }

  protected onEmailSent(updated: InvoiceWithTotals): void {
    this.invoices.update((invoices) =>
      invoices.map((invoice) => (invoice.id === updated.id ? updated : invoice)),
    );
    this.emailModalInvoice.set(null);
  }
}
