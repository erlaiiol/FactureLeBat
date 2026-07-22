import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { InvoiceService } from '../../core/services/invoice.service';
import { BigButtonComponent } from '../../shared/components/big-button.component';
import { InvoiceTotalsSummaryComponent } from './components/invoice-totals-summary.component';
import { InvoiceDraftStore } from './invoice-draft.store';

// Phase 6 shell: wraps the two routed creation steps (client, lignes) with
// what must stay visible and reachable from either one — the live running
// total and the "Aperçu" button, both driven off the shared InvoiceDraftStore
// rather than whichever step happens to be mounted.
@Component({
  selector: 'app-invoice-create-shell-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    BigButtonComponent,
    InvoiceTotalsSummaryComponent,
  ],
  templateUrl: './invoice-create-shell.page.html',
})
export class InvoiceCreateShellPage {
  private readonly invoiceService = inject(InvoiceService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly draftStore = inject(InvoiceDraftStore);

  protected readonly previewing = signal(false);
  protected readonly previewError = signal<string | null>(null);

  protected preview(): void {
    if (this.previewing() || !this.draftStore.canPreview()) {
      return;
    }
    this.previewing.set(true);
    this.previewError.set(null);

    const request = this.draftStore.buildInvoiceRequest(
      this.draftStore.customer().customerId ?? undefined,
    );

    this.invoiceService
      .previewPdf(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.previewing.set(false);
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank');
          // The opened tab has loaded the blob into its own memory by the
          // time it navigates; revoking shortly after frees it here without
          // racing the tab's initial render.
          setTimeout(() => URL.revokeObjectURL(url), 10_000);
        },
        error: () => {
          this.previewing.set(false);
          this.previewError.set("Impossible de générer l'aperçu pour le moment.");
        },
      });
  }
}
