import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription, TimeoutError } from 'rxjs';
import { InvoiceWithTotals } from '../../../core/models/invoice.model';
import { InvoiceService } from '../../../core/services/invoice.service';
import { ToastService } from '../../../core/services/toast.service';
import { BigButtonComponent } from '../../../shared/components/big-button.component';
import { IconCloseComponent } from '../../../shared/components/icon-close.component';
import { IconTrashComponent } from '../../../shared/components/icon-trash.component';
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
    IconCloseComponent,
    IconTrashComponent,
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
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly store = inject(ManualInvoiceDraftStore);

  // Same `--invoice-footer-height` measure-and-publish as
  // InvoiceCreateShellPage's identical footer bar — see there for why.
  @ViewChild('footerBar') private readonly footerBarRef?: ElementRef<HTMLElement>;
  private footerHeightObserver?: ResizeObserver;

  protected readonly previewing = signal(false);
  protected readonly previewError = signal<string | null>(null);
  protected readonly previewPdfUrl = signal<string | null>(null);
  private previewSubscription?: Subscription;

  protected readonly creating = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly createdInvoice = signal<InvoiceWithTotals | null>(null);

  // Phase 14.3: same "Créer la facture aussi immédiatement ?" prompt as
  // mode rapide's preview step — see InvoiceCreatePreviewStepPage.
  protected readonly converting = signal(false);
  protected readonly conversionDeclined = signal(false);

  // "Créer la facture à partir du devis" — see InvoiceCreateShellPage's
  // identical fromDevisId handling for mode rapide.
  protected readonly loadingSourceDevis = signal(false);
  // Dedupes fromDevisId handling below — "modifier avant facturation" (see
  // editBeforeInvoicing) navigates back into this exact same route, which
  // Angular's default reuse strategy keeps this component instance for
  // (never recreated), so a plain constructor-only read would miss that
  // second arrival entirely (see the queryParamMap subscription below).
  private lastLoadedDevisId: string | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.revokeCurrentPreviewUrl());

    afterNextRender(() => this.observeFooterHeight());
    this.destroyRef.onDestroy(() => {
      this.footerHeightObserver?.disconnect();
      document.documentElement.style.removeProperty('--invoice-footer-height');
    });

    // Subscribed (not just the constructor-time snapshot) — see
    // InvoiceCreateShellPage's identical reasoning: this page can be
    // re-entered with a new fromDevisId without ever being recreated.
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      // Phase 14.3: only when the mode-choice slider actually sent one — see
      // InvoiceCreateShellPage's identical guard for mode rapide.
      const type = params.get('type');
      if (type === 'DEVIS' || type === 'FACTURE') {
        this.store.setDocumentType(type);
      }

      const fromDevisId = params.get('fromDevisId');
      if (fromDevisId && fromDevisId !== this.lastLoadedDevisId) {
        this.lastLoadedDevisId = fromDevisId;
        this.loadingSourceDevis.set(true);
        this.invoiceService
          .getById(fromDevisId)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (devis) => {
              this.store.loadFromInvoice(devis);
              // loadFromInvoice always clears the number back to blank (a
              // converted facture never reuses the devis's own number) — a
              // fresh suggestion is fetched here rather than relying on the
              // call below, which already ran before this async fetch
              // resolved and found the field blank for the wrong reason.
              this.store.ensureNumberSuggestion();
              this.loadingSourceDevis.set(false);
            },
            error: () => {
              this.loadingSourceDevis.set(false);
              this.toastService.error('Impossible de charger ce devis pour le moment.');
              void this.router.navigate(['/factures']);
            },
          });
      } else {
        // Fresh draft (no fromDevisId) — the loadFromInvoice path above
        // fetches its own suggestion once it knows the real documentType.
        this.store.ensureNumberSuggestion();
      }
    });
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

  // Auto-adds the "€" as soon as the artisan leaves a price cell, so it
  // never has to be typed by hand and is already there — in the live
  // preview below and in the PDF/aperçu, both of which render manual cells
  // as typed — without waiting for an explicit "Mettre en forme" click.
  // Only UNIT_PRICE/LINE_TOTAL are money; other columns are free text
  // formatManualPrice would just leave untouched anyway, but this is only
  // wired up on those two so an artisan mid-edit on a text cell never sees
  // a surprise reformat on blur.
  protected onPriceCellBlur(row: ManualRowDraft, column: ManualColumnDraft): void {
    if (column.role !== 'UNIT_PRICE' && column.role !== 'LINE_TOTAL') {
      return;
    }
    this.store.setCellValue(row.id, column.id, formatManualPrice(row.cells[column.id] ?? ''));
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

    this.previewSubscription = this.invoiceService
      .previewPdf(this.store.buildInvoiceRequest())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.previewing.set(false);
          this.revokeCurrentPreviewUrl();
          this.previewPdfUrl.set(URL.createObjectURL(blob));
        },
        error: (error: HttpErrorResponse | TimeoutError) => {
          this.previewing.set(false);
          // premiumGateInterceptor already showed the paywall modal for the
          // 402 — this just skips the generic error message.
          if (error instanceof HttpErrorResponse && error.status === 402) {
            return;
          }
          this.previewError.set(
            error instanceof TimeoutError
              ? 'La génération du PDF prend trop de temps. Réessayez.'
              : "Impossible de générer l'aperçu pour le moment.",
          );
        },
      });
  }

  protected closePreview(): void {
    this.previewSubscription?.unsubscribe();
    this.previewing.set(false);
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
          this.toastService.success(`Devis converti en facture ${facture.number}.`);
        },
        error: (error: HttpErrorResponse) => {
          this.converting.set(false);
          // premiumGateInterceptor already showed the paywall modal for the
          // 402 — this just skips the generic error message.
          if (error.status === 402) {
            return;
          }
          this.errorMessage.set('Impossible de créer la facture pour le moment.');
        },
      });
  }

  protected declineConversion(): void {
    this.conversionDeclined.set(true);
  }

  // Same purpose as InvoiceCreatePreviewStepPage.editBeforeInvoicing — this
  // devis was authored in mode manuel, so the target is the manuel canvas
  // itself, pre-filled from it. Unlike the rapide counterpart, this
  // navigates to the exact route this component is already mounted on
  // (Angular reuses the instance rather than recreating it), so the
  // success screen's own state is cleared explicitly here — otherwise
  // createdInvoice() would keep showing it instead of the freshly-loading
  // editor.
  protected editBeforeInvoicing(): void {
    const devis = this.createdInvoice();
    if (!devis) {
      return;
    }
    this.createdInvoice.set(null);
    this.conversionDeclined.set(false);
    this.errorMessage.set(null);
    void this.router.navigate(['/factures/nouvelle/manuel'], {
      queryParams: { type: 'FACTURE', fromDevisId: devis.id },
    });
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
        error: (error: HttpErrorResponse) => {
          this.creating.set(false);
          // Same free-trial wall as mode rapide's submit() — see
          // InvoiceCreatePreviewStepPage. premiumGateInterceptor already
          // showed the paywall modal, so this just skips the generic message.
          if (error.status === 402) {
            return;
          }
          // Phase 27: a custom/typed number already used by this company —
          // surfaces InvoiceService.createInvoiceRow's actual message
          // ("Ce numéro est déjà utilisé.") instead of the generic one, so
          // the artisan knows exactly what to fix rather than just retrying
          // the same request.
          if (error.status === 409) {
            this.errorMessage.set(error.error?.message ?? 'Ce numéro est déjà utilisé.');
            return;
          }
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

  private observeFooterHeight(): void {
    const element = this.footerBarRef?.nativeElement;
    if (!element) {
      return;
    }
    const updateFooterHeight = () => {
      document.documentElement.style.setProperty(
        '--invoice-footer-height',
        `${element.getBoundingClientRect().height}px`,
      );
    };
    updateFooterHeight();
    this.footerHeightObserver = new ResizeObserver(updateFooterHeight);
    this.footerHeightObserver.observe(element);
  }
}
