import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { InvoiceWithTotals } from '../../../core/models/invoice.model';
import { InvoiceService } from '../../../core/services/invoice.service';
import { BigButtonComponent } from '../../../shared/components/big-button.component';
import { PdfPreviewModalComponent } from '../../../shared/components/pdf-preview-modal.component';
import { TourAnchorDirective } from '../../../shared/tour/tour-anchor.directive';
import { InvoiceTotalsSummaryComponent } from '../components/invoice-totals-summary.component';
import {
  ManualColumnDraft,
  ManualInvoiceDraftStore,
  ManualRowDraft,
} from './manual-invoice-draft.store';
import {
  formatManualPrice,
  parseManualNumber,
  parseManualQuantityMagnitude,
} from './manual-cell-format.util';
import { ManualResizeHandleDirective } from './manual-resize-handle.directive';

// Phase 9.5 mode manuel: the free-form, PDF-like invoice canvas. A single
// page (unlike mode rapide's shell + routed steps) since there is no
// multi-step flow here — one table, edited directly, submitted through the
// same POST /invoices / POST /invoices/preview endpoints as mode rapide,
// just with entryMode: 'MANUAL' and a manualTable body instead of lines.
@Component({
  selector: 'app-invoice-create-manual-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BigButtonComponent,
    PdfPreviewModalComponent,
    TourAnchorDirective,
    InvoiceTotalsSummaryComponent,
    ManualResizeHandleDirective,
  ],
  templateUrl: './invoice-create-manual.page.html',
})
export class InvoiceCreateManualPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly invoiceService = inject(InvoiceService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly store = inject(ManualInvoiceDraftStore);

  protected readonly previewing = signal(false);
  protected readonly previewError = signal<string | null>(null);
  protected readonly previewPdfUrl = signal<string | null>(null);

  protected readonly creating = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly createdInvoice = signal<InvoiceWithTotals | null>(null);

  // Phase 14.3: same "Créer la facture aussi immédiatement ?" prompt as
  // mode rapide's preview step — see InvoiceCreatePreviewStepPage.
  protected readonly converting = signal(false);
  protected readonly conversionDeclined = signal(false);

  constructor() {
    this.destroyRef.onDestroy(() => this.revokeCurrentPreviewUrl());

    // Phase 14.3: only when the mode-choice slider actually sent one — see
    // InvoiceCreateShellPage's identical guard for mode rapide.
    const type = this.route.snapshot.queryParamMap.get('type');
    if (type === 'DEVIS' || type === 'FACTURE') {
      this.store.setDocumentType(type);
    }
  }

  // "Compléter le prix total" (the "?" button): crosses the quantity and
  // unit price columns to suggest a value for the row's own freehand
  // LINE_TOTAL cell — never writes to it silently, only on this explicit
  // click, and never locks it afterward (the artisan can still overwrite
  // it). Quantity is free text on the manual canvas (e.g. "2 boites"), so
  // only its leading numeric part is used; a quantity with no usable number
  // at all falls back to 1 (i.e. the unit price alone).
  protected autofillTotal(row: ManualRowDraft): void {
    const quantityColumnId = this.store.columns().find((c) => c.role === 'QUANTITY')?.id;
    const unitPriceColumnId = this.store.columns().find((c) => c.role === 'UNIT_PRICE')?.id;
    const lineTotalColumnId = this.store.columns().find((c) => c.role === 'LINE_TOTAL')?.id;
    if (!lineTotalColumnId) {
      return;
    }
    const magnitude = parseManualQuantityMagnitude(row.cells[quantityColumnId ?? ''] ?? '') ?? 1;
    const unitPrice = parseManualNumber(row.cells[unitPriceColumnId ?? ''] ?? '') ?? 0;
    this.store.setCellValue(
      row.id,
      lineTotalColumnId,
      formatManualPrice(String(magnitude * unitPrice)),
    );
  }

  protected onCellInput(rowId: string, columnId: string, event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.store.setCellValue(rowId, columnId, value);
  }

  protected onLabelInput(column: ManualColumnDraft, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.store.renameColumn(column.id, value);
  }

  // Deliberately not gated on store.canPreview() — manual mode's whole
  // principle is that nothing blocks the artisan from looking at their
  // work-in-progress invoice at any point; an incomplete draft just surfaces
  // the backend's validation error below instead of a disabled button.
  protected preview(): void {
    if (this.previewing()) {
      return;
    }
    this.previewing.set(true);
    this.previewError.set(null);

    this.invoiceService
      .previewPdf(this.store.buildInvoiceRequest())
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

  protected pdfUrl(invoiceId: string): string {
    return this.invoiceService.pdfUrl(invoiceId);
  }

  protected back(): void {
    this.router.navigate(['/factures/nouvelle']);
  }

  protected startNewInvoice(): void {
    this.createdInvoice.set(null);
    this.errorMessage.set(null);
    this.conversionDeclined.set(false);
    this.store.reset();
  }

  // Phase 14.3: see InvoiceCreatePreviewStepPage.convertToFacture — same
  // behavior, duplicated rather than shared since the two pages don't
  // otherwise depend on each other.
  protected convertToFacture(): void {
    const devis = this.createdInvoice();
    if (!devis || this.converting()) {
      return;
    }
    this.converting.set(true);
    this.errorMessage.set(null);
    this.invoiceService
      .convertToFacture(devis.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (facture) => {
          this.converting.set(false);
          this.createdInvoice.set(facture);
        },
        error: () => {
          this.converting.set(false);
          this.errorMessage.set('Impossible de créer la facture pour le moment.');
        },
      });
  }

  protected declineConversion(): void {
    this.conversionDeclined.set(true);
  }

  // Same purpose as startNewInvoice() but reachable mid-edit, not only from
  // the post-success screen — a confirm() guard since this discards unsaved
  // input with no undo, exactly like the shell page's rapide-mode equivalent.
  protected resetDraft(): void {
    if (!window.confirm('Vider tous les champs de cette facture et repartir de zéro ?')) {
      return;
    }
    this.errorMessage.set(null);
    this.store.reset();
  }

  protected submit(): void {
    if (this.creating()) {
      return;
    }
    if (!this.store.canPreview()) {
      this.errorMessage.set(
        'Merci de renseigner un client et au moins une ligne avec une désignation avant de créer la facture.',
      );
      return;
    }

    this.creating.set(true);
    this.errorMessage.set(null);

    this.invoiceService
      .create(this.store.buildInvoiceRequest())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (invoice) => {
          this.creating.set(false);
          this.createdInvoice.set(invoice);
          this.store.reset();
        },
        error: () => {
          this.creating.set(false);
          this.errorMessage.set('Erreur lors de la création de la facture. Veuillez réessayer.');
        },
      });
  }

  private revokeCurrentPreviewUrl(): void {
    const url = this.previewPdfUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }
  }
}
