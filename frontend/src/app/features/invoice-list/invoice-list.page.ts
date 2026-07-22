import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { InvoiceWithTotals } from '../../core/models/invoice.model';
import { InvoiceService } from '../../core/services/invoice.service';
import { CentsToEurosPipe } from '../../shared/pipes/cents-to-euros.pipe';
import { SendInvoiceEmailModalComponent } from './send-invoice-email-modal.component';

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

  protected pdfUrl(invoiceId: string): string {
    return this.invoiceService.pdfUrl(invoiceId);
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
