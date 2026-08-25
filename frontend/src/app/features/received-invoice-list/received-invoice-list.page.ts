import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReceivedInvoice } from '../../core/models/received-invoice.model';
import { CompanyService } from '../../core/services/company.service';
import { ReceivedInvoiceService } from '../../core/services/received-invoice.service';
import { ToastService } from '../../core/services/toast.service';
import { SkeletonRowsComponent } from '../../shared/components/skeleton-rows.component';
import { CentsToEurosPipe } from '../../shared/pipes/cents-to-euros.pipe';
import { delayedSkeleton } from '../../shared/utils/delayed-skeleton';

// Phase 1.2-5 (2026 e-invoicing reform): a minimal, read-only inbox for
// supplier invoices received through the connected PA — see
// docs/roadmap.md Phase 1.2-5's own non-goals (no OCR, no expense
// tracking, no reply/dispute actions). Mirrors DiscountListPage's own
// "simple list, loading/error/empty states" shape.
@Component({
  selector: 'app-received-invoice-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SkeletonRowsComponent, CentsToEurosPipe],
  templateUrl: './received-invoice-list.page.html',
})
export class ReceivedInvoiceListPage {
  private readonly receivedInvoiceService = inject(ReceivedInvoiceService);
  private readonly companyService = inject(CompanyService);
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly invoices = signal<ReceivedInvoice[]>([]);
  protected readonly loading = signal(true);
  protected readonly showSkeleton = delayedSkeleton(this.loading);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly syncing = signal(false);

  // Same "configured app-wide, connected per-company" gate as the invoice
  // board's own "Envoyer via PA" button (CompanyService.getSuperPdpStatus).
  protected readonly superPdpConnected = signal(false);

  constructor() {
    this.receivedInvoiceService
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (invoices) => {
          this.invoices.set(invoices);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.errorMessage.set('Impossible de charger vos factures reçues. Veuillez réessayer.');
        },
      });

    this.companyService
      .getSuperPdpStatus()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (status) => this.superPdpConnected.set(status.configured && status.connected),
        error: () => this.superPdpConnected.set(false),
      });
  }

  protected sync(): void {
    if (this.syncing()) {
      return;
    }
    this.syncing.set(true);
    this.receivedInvoiceService
      .sync()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (invoices) => {
          this.syncing.set(false);
          this.invoices.set(invoices);
          this.toastService.success('Factures reçues à jour.');
        },
        error: () => {
          this.syncing.set(false);
          this.toastService.error('Impossible de récupérer vos factures reçues pour le moment.');
        },
      });
  }

  protected downloadUrl(invoice: ReceivedInvoice): string {
    return this.receivedInvoiceService.downloadUrl(invoice.id);
  }

  protected formattedIssueDate(invoice: ReceivedInvoice): string | null {
    return invoice.issueDate ? new Date(invoice.issueDate).toLocaleDateString('fr-FR') : null;
  }
}
