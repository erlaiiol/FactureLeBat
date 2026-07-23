import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { InvoiceService } from '../../core/services/invoice.service';
import { BigButtonComponent } from '../../shared/components/big-button.component';
import { PdfPreviewModalComponent } from '../../shared/components/pdf-preview-modal.component';
import { TourAnchorDirective } from '../../shared/tour/tour-anchor.directive';
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
    PdfPreviewModalComponent,
    TourAnchorDirective,
  ],
  templateUrl: './invoice-create-shell.page.html',
})
export class InvoiceCreateShellPage {
  private readonly invoiceService = inject(InvoiceService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  protected readonly draftStore = inject(InvoiceDraftStore);

  protected readonly previewing = signal(false);
  protected readonly previewError = signal<string | null>(null);
  // Owns the object URL's lifecycle: set on a successful preview, revoked
  // (and cleared) on close or component destroy — never left dangling like
  // the old window.open + fixed 10s timeout did.
  protected readonly previewPdfUrl = signal<string | null>(null);

  constructor() {
    this.destroyRef.onDestroy(() => this.revokeCurrentPreviewUrl());
  }

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
          this.revokeCurrentPreviewUrl();
          this.previewPdfUrl.set(URL.createObjectURL(blob));
        },
        error: () => {
          this.previewing.set(false);
          this.previewError.set("Impossible de générer l'aperçu pour le moment.");
        },
      });
  }

  protected closePreview(): void {
    this.revokeCurrentPreviewUrl();
    this.previewPdfUrl.set(null);
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

  private revokeCurrentPreviewUrl(): void {
    const url = this.previewPdfUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }
  }
}
