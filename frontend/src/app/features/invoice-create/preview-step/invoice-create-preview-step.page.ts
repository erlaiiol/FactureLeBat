import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { InvoiceWithTotals } from '../../../core/models/invoice.model';
import { CompanyService } from '../../../core/services/company.service';
import { InvoiceService } from '../../../core/services/invoice.service';
import { InvoiceShareService } from '../../../core/services/invoice-share.service';
import { ToastService } from '../../../core/services/toast.service';
import { BigButtonComponent } from '../../../shared/components/big-button.component';
import { IconEyeComponent } from '../../../shared/components/icon-eye.component';
import { IconEyeOffComponent } from '../../../shared/components/icon-eye-off.component';
import { PdfPreviewModalComponent } from '../../../shared/components/pdf-preview-modal.component';
import { CentsToEurosPipe } from '../../../shared/pipes/cents-to-euros.pipe';
import { UnitLabelPipe } from '../../../shared/pipes/unit-label.pipe';
import { SendInvoiceEmailModalComponent } from '../../../shared/components/send-invoice-email-modal.component';
import { TourAnchorDirective } from '../../../shared/tour/tour-anchor.directive';
import { delayedSkeleton } from '../../../shared/utils/delayed-skeleton';
import { InvoiceDraftStore } from '../invoice-draft.store';

// Phase 15: the mandatory stop between "lignes" and a real, persisted
// invoice. Renders an HTML mirror of the document (not the actual PDF —
// see docs/roadmap.md Phase 15's implementation notes for why) built from
// InvoiceService.previewData()'s computed figures, so this component never
// duplicates InvoiceCalculationService's math — only its own layout. Every
// per-line technical detail (unit, billed-quantity/packaging-rounding note)
// is hover-highlighted and click-toggleable; the toggle state lives on
// InvoiceDraftStore (draft-persisted, same localStorage mechanism as every
// other field) and is what finally reaches the backend as
// showUnitDetail/showBillingDetail on the real create request. "Créer la
// facture" — previously reachable directly from the lines step — now only
// exists here.
@Component({
  selector: 'app-invoice-create-preview-step-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    BigButtonComponent,
    IconEyeComponent,
    IconEyeOffComponent,
    CentsToEurosPipe,
    UnitLabelPipe,
    PdfPreviewModalComponent,
    SendInvoiceEmailModalComponent,
    TourAnchorDirective,
  ],
  templateUrl: './invoice-create-preview-step.page.html',
})
export class InvoiceCreatePreviewStepPage {
  private readonly invoiceService = inject(InvoiceService);
  private readonly invoiceShareService = inject(InvoiceShareService);
  private readonly companyService = inject(CompanyService);
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  protected readonly draftStore = inject(InvoiceDraftStore);

  protected readonly today = new Date();

  protected readonly loading = signal(true);
  protected readonly showSkeleton = delayedSkeleton(this.loading);
  protected readonly loadError = signal<string | null>(null);
  protected readonly previewData = signal<InvoiceWithTotals | null>(null);

  // Best-effort, non-blocking: a company profile fetch failure must never
  // stop the artisan from previewing/sending their document — it only ever
  // suppresses this warning. A French SIRET is mandatory on any invoice/devis
  // (legal requirement); the default profile created at signup starts with
  // an empty one (see backend's DEFAULT_COMPANY_PROFILE), so nothing else in
  // the app forces it to be filled in before this screen is reached.
  private readonly companySiret = signal<string | null>(null);
  protected readonly missingSiret = computed(() => {
    const siret = this.companySiret();
    return siret !== null && !/^\d{14}$/.test(siret);
  });

  protected readonly previewLines = computed(() => this.previewData()?.lines ?? []);
  // Mirrors PdfService's own rule: only VISIBLE service lines get their own
  // row — a REDISTRIBUTED one is already folded into the lines above.
  protected readonly visibleServiceLines = computed(() =>
    (this.previewData()?.serviceLines ?? []).filter((line) => line.visibility === 'VISIBLE'),
  );

  protected readonly creating = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly createdInvoice = signal<InvoiceWithTotals | null>(null);
  protected readonly showEmailModal = signal(false);
  protected readonly sharing = signal(false);

  // Phase 14.3: the "Créer la facture aussi immédiatement ?" prompt shown
  // after a devis is created — see convertToFacture below.
  protected readonly converting = signal(false);
  protected readonly conversionDeclined = signal(false);

  // Secondary affordance: the artisan can still open the exact, real PDF
  // (same app-pdf-preview-modal Phase 6 already used) as a fidelity check
  // alongside this HTML mirror — never the primary interaction surface.
  protected readonly downloadingPdf = signal(false);
  protected readonly pdfPreviewUrl = signal<string | null>(null);

  constructor() {
    this.destroyRef.onDestroy(() => this.revokeCurrentPdfPreviewUrl());

    if (!this.draftStore.canPreview()) {
      // Reached directly (refresh, back/forward) on an empty/incomplete
      // draft — nothing meaningful to preview, so send the artisan back to
      // finish the lines step rather than rendering a broken document.
      void this.router.navigate(['/factures/nouvelle/rapide/lignes']);
      return;
    }
    this.loadPreview();
    this.companyService
      .getProfile()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (profile) => this.companySiret.set(profile.siret),
        // Silent: see companySiret's comment above.
        error: () => undefined,
      });
  }

  protected loadPreview(): void {
    this.loading.set(true);
    this.loadError.set(null);
    const request = this.draftStore.buildInvoiceRequest(
      this.draftStore.customer().customerId ?? undefined,
    );

    this.invoiceService
      .previewData(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.loading.set(false);
          this.previewData.set(data);
        },
        error: (error: HttpErrorResponse) => {
          this.loading.set(false);
          if (error.status === 402) {
            // The priced preview/invoice creation is blocked (free trial
            // used up — premiumGateInterceptor already showed the paywall
            // modal), but a "enregistrer dans mon catalogue"/"enregistrer
            // ce client" toggle checked back on the lines/customer step is a
            // free-tier request that must still go through — otherwise it's
            // silently lost the moment this screen can't be reached (see
            // InvoiceDraftStore.persistFreeEntities).
            this.draftStore
              .persistFreeEntities()
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe((hadAnyToSave) => {
                if (hadAnyToSave) {
                  this.toastService.success('Votre catalogue a été mis à jour.');
                }
              });
            return;
          }
          this.loadError.set("Impossible de calculer l'aperçu pour le moment.");
        },
      });
  }

  protected toggleUnitDetail(index: number): void {
    this.draftStore.toggleLineDetail(index, 'showUnitDetail');
  }

  protected toggleBillingDetail(index: number): void {
    this.draftStore.toggleLineDetail(index, 'showBillingDetail');
  }

  protected back(): void {
    void this.router.navigate(['/factures/nouvelle/rapide/lignes']);
  }

  protected downloadPdfPreview(): void {
    if (this.downloadingPdf()) {
      return;
    }
    this.downloadingPdf.set(true);
    const request = this.draftStore.buildInvoiceRequest(
      this.draftStore.customer().customerId ?? undefined,
    );
    this.invoiceService
      .previewPdf(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.downloadingPdf.set(false);
          this.revokeCurrentPdfPreviewUrl();
          this.pdfPreviewUrl.set(URL.createObjectURL(blob));
        },
        error: (error: HttpErrorResponse) => {
          this.downloadingPdf.set(false);
          // premiumGateInterceptor already showed the paywall modal for the
          // 402 — this just skips the generic error toast.
          if (error.status === 402) {
            return;
          }
          this.toastService.error("Impossible de générer l'aperçu PDF pour le moment.");
        },
      });
  }

  protected closePdfPreview(): void {
    this.revokeCurrentPdfPreviewUrl();
    this.pdfPreviewUrl.set(null);
  }

  private revokeCurrentPdfPreviewUrl(): void {
    const url = this.pdfPreviewUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }
  }

  protected pdfUrl(invoiceId: string): string {
    return this.invoiceService.pdfUrl(invoiceId);
  }

  protected openEmailModal(): void {
    this.showEmailModal.set(true);
  }

  protected async share(): Promise<void> {
    const invoice = this.createdInvoice();
    if (!invoice || this.sharing()) {
      return;
    }
    this.sharing.set(true);
    try {
      const outcome = await this.invoiceShareService.share(invoice);
      if (outcome === 'compose-email') {
        this.openEmailModal();
      }
    } catch {
      this.toastService.error('Impossible de partager ce document pour le moment.');
    } finally {
      this.sharing.set(false);
    }
  }

  protected closeEmailModal(): void {
    this.showEmailModal.set(false);
  }

  protected onEmailSent(updated: InvoiceWithTotals): void {
    this.createdInvoice.set(updated);
    this.showEmailModal.set(false);
    this.toastService.success('Email envoyé au client.');
  }

  protected startNewInvoice(): void {
    this.createdInvoice.set(null);
    this.errorMessage.set(null);
    this.conversionDeclined.set(false);
    this.draftStore.reset();
    void this.router.navigate(['/factures/nouvelle/rapide/client']);
  }

  // Phase 14.3: "Créer la facture aussi immédiatement ?" — accepting reuses
  // the devis's own already-confirmed data (see InvoiceService.convertToFacture
  // on the backend) and swaps the success screen over to the new facture,
  // rather than leaving the artisan looking at the devis they just converted.
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

  // Moved here from InvoiceCreateLinesStepPage as-is (Phase 15: "Créer la
  // facture" only exists on this screen now) — reads exclusively off
  // InvoiceDraftStore rather than a FormArray, since the lines step's forms
  // no longer exist by the time the artisan reaches this page.
  //
  // Catalog/customer persistence itself lives on
  // InvoiceDraftStore.persistFreeEntities (also called from loadPreview()'s
  // 402 handler below) — it's free-tier config, not part of what the
  // premium gate blocks, so it isn't only reachable from here anymore. It
  // updates the draft's customerId/catalogProductId/catalogServiceId in
  // place, which is why buildInvoiceRequest below is read fresh afterwards
  // rather than off a `customer` snapshot taken before it ran.
  protected submit(): void {
    if (this.creating() || !this.draftStore.canPreview()) {
      return;
    }

    this.creating.set(true);
    this.errorMessage.set(null);

    this.draftStore
      .persistFreeEntities()
      .pipe(
        switchMap(() =>
          this.invoiceService.create(
            this.draftStore.buildInvoiceRequest(this.draftStore.customer().customerId ?? undefined),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (invoice) => {
          this.creating.set(false);
          this.createdInvoice.set(invoice);
          this.draftStore.reset();
        },
        error: (error: HttpErrorResponse) => {
          this.creating.set(false);
          // Phase 14: a 402 here means the free-trial invoice is already
          // used up — premiumGateInterceptor already showed the paywall
          // modal, so this just skips the generic message.
          if (error.status === 402) {
            return;
          }
          this.errorMessage.set('Erreur lors de la création de la facture. Veuillez réessayer.');
        },
      });
  }
}
