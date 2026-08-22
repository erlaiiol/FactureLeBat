import { HttpErrorResponse } from '@angular/common/http';
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
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, Subscription, TimeoutError } from 'rxjs';
import { LegalStatus } from '../../core/models/company.model';
import { InvoiceService } from '../../core/services/invoice.service';
import { KeyboardVisibilityService } from '../../core/services/keyboard-visibility.service';
import { BigButtonComponent } from '../../shared/components/big-button.component';
import { IconTrashComponent } from '../../shared/components/icon-trash.component';
import { PdfPreviewModalComponent } from '../../shared/components/pdf-preview-modal.component';
import { TourAnchorDirective } from '../../shared/tour/tour-anchor.directive';
import { ToastService } from '../../core/services/toast.service';
import { CentsToEurosPipe } from '../../shared/pipes/cents-to-euros.pipe';
import { InvoiceTotalsSummaryComponent } from './components/invoice-totals-summary.component';
import { InvoiceDraftStore } from './invoice-draft.store';
import { FIXED_VAT_RATE_OPTIONS } from './vat-rate-options';

// Phase 6 shell: wraps the three routed creation steps (client, lignes,
// apercu) with what must stay visible and reachable from any of them — the
// live running total, both driven off the shared InvoiceDraftStore rather
// than whichever step happens to be mounted. Phase 23: "Aperçu de la
// facture" now opens the real PDF in-place (app-pdf-preview-modal), same
// blob-fetch mechanism as InvoiceCreatePreviewStepPage's own "Voir le PDF
// exact avant création" link — it no longer routes into the apercu step,
// which stays reachable only via its own nav tab and is now purely where
// the artisan customizes the document's display and finalizes it.
@Component({
  selector: 'app-invoice-create-shell-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    BigButtonComponent,
    IconTrashComponent,
    PdfPreviewModalComponent,
    InvoiceTotalsSummaryComponent,
    TourAnchorDirective,
    CentsToEurosPipe,
  ],
  templateUrl: './invoice-create-shell.page.html',
})
export class InvoiceCreateShellPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly invoiceService = inject(InvoiceService);
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly draftStore = inject(InvoiceDraftStore);
  protected readonly keyboardVisibility = inject(KeyboardVisibilityService);

  // Measured and republished as the `--invoice-footer-height` CSS variable —
  // see observeFooterHeight below and app-toast-container's identical
  // `--nav-height` pattern, mirrored here for the bottom edge: this bar sits
  // fixed at the same viewport edge as the global toasts, and without this
  // they'd render inside its opaque footprint instead of above it.
  @ViewChild('footerBar') private readonly footerBarRef?: ElementRef<HTMLElement>;
  private footerHeightObserver?: ResizeObserver;

  protected readonly loadingPdfPreview = signal(false);
  protected readonly pdfPreviewUrl = signal<string | null>(null);

  // First-invoice-pipeline reversal: the one-time VAT-regime prompt shown in
  // place of nothing extra (see the .html — it sits alongside the totals
  // card, never replacing it, so the tour's `invoice-total`/`invoice-preview`
  // anchors stay mounted whether or not this has been answered yet).
  protected readonly vatRateOptions = FIXED_VAT_RATE_OPTIONS;
  protected readonly showVatRatePicker = signal(false);
  protected readonly confirmingLegalStatus = signal(false);
  // Lets closePdfPreview() cancel an in-flight generation if the artisan
  // closes the modal before it resolves — otherwise a late response could
  // reopen the modal (or set a URL) after they've already moved on.
  private pdfPreviewSubscription?: Subscription;

  // "Créer la facture à partir du devis" (mes documents' second action, and
  // the post-devis "modifier avant facturation" prompt): true once a
  // `fromDevisId` query param has been resolved and loaded into the draft —
  // hides the "1. Client" tab, per the deliberate "no going back to pick a
  // different client" rule for this entry point (the devis's client is
  // already final at that point).
  protected readonly cameFromDevis = signal(false);
  protected readonly loadingSourceDevis = signal(false);
  // Dedupes fromDevisId handling below — this shell component is reused
  // (never recreated) across its own child steps and across a second
  // "modifier avant facturation" navigation back into itself from the
  // apercu step, so a plain constructor-only read would miss that second
  // arrival entirely (see the queryParamMap subscription below).
  private lastLoadedDevisId: string | null = null;

  constructor() {
    // Subscribed (not just the constructor-time snapshot) because this
    // shell component persists across every rapide/* child route, including
    // a "modifier avant facturation" navigation from apercu back to lignes
    // with a fresh fromDevisId — a snapshot taken once here would only ever
    // see the very first arrival.
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      // Phase 14.3: only when the mode-choice slider actually sent one — a
      // direct/bookmarked entry into `rapide` (no query param) must never
      // silently flip an in-progress devis draft back to FACTURE.
      const type = params.get('type');
      if (type === 'DEVIS' || type === 'FACTURE') {
        this.draftStore.setDocumentType(type);
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
              this.draftStore.loadFromInvoice(devis);
              this.cameFromDevis.set(true);
              this.loadingSourceDevis.set(false);
            },
            error: () => {
              this.loadingSourceDevis.set(false);
              this.toastService.error('Impossible de charger ce devis pour le moment.');
              void this.router.navigate(['/factures']);
            },
          });
      }
    });

    this.destroyRef.onDestroy(() => this.revokeCurrentPdfPreviewUrl());

    afterNextRender(() => this.observeFooterHeight());
    this.destroyRef.onDestroy(() => {
      this.footerHeightObserver?.disconnect();
      document.documentElement.style.removeProperty('--invoice-footer-height');
    });
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

  // Phase 15: hides the bottom bar's own "Aperçu" button while already on
  // the apercu/finalize step — it would otherwise sit there redundantly
  // next to that screen's own "Voir le PDF exact avant création" link.
  protected readonly onPreviewStep = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
    ),
    { initialValue: null },
  );

  protected isOnPreviewStep(): boolean {
    return (this.onPreviewStep()?.urlAfterRedirects ?? this.router.url).endsWith('/apercu');
  }

  // Phase 23: fetches the real PDF for the draft as it stands right now and
  // opens it in-place, from whichever step the artisan is currently on —
  // replaces the old behavior of navigating into the apercu step just to
  // see it.
  //
  // First-invoice-pipeline reversal: deliberately NOT gated by
  // CompanyEssentialsGateService (name/SIRET/address) — this is a pure,
  // local, pre-creation preview (InvoiceService.previewPdf, nothing
  // persisted, nothing sent to anyone), the same "artisan looking at their
  // own draft" moment the on-screen /apercu mirror already goes ungated for.
  // Blocking the one thing an artisan most wants to do right after adding a
  // line — see what it looks like — with an admin-form modal would undo the
  // whole point of this pipeline reversal. Gating stays reserved for
  // share()/the real download link, once a document actually exists to
  // hand to a client. vatRegimeConfirmed() below is a different, narrower
  // concern: showing an unconfirmed default VAT total would be actively
  // wrong, not just informationally incomplete, so that one stays required.
  protected openPdfPreview(): void {
    if (
      !this.draftStore.canPreview() ||
      !this.draftStore.vatRegimeConfirmed() ||
      this.loadingPdfPreview()
    ) {
      return;
    }
    this.loadingPdfPreview.set(true);
    const request = this.draftStore.buildInvoiceRequest(
      this.draftStore.customer().customerId ?? undefined,
    );
    this.pdfPreviewSubscription = this.invoiceService
      .previewPdf(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.loadingPdfPreview.set(false);
          this.revokeCurrentPdfPreviewUrl();
          this.pdfPreviewUrl.set(URL.createObjectURL(blob));
        },
        error: (error: HttpErrorResponse | TimeoutError) => {
          this.loadingPdfPreview.set(false);
          // premiumGateInterceptor already showed the paywall modal for the
          // 402 — this just skips the generic error toast.
          if (error instanceof HttpErrorResponse && error.status === 402) {
            return;
          }
          this.toastService.error(
            error instanceof TimeoutError
              ? 'La génération du PDF prend trop de temps. Réessayez.'
              : "Impossible de générer l'aperçu PDF pour le moment.",
          );
        },
      });
  }

  protected closePdfPreview(): void {
    this.pdfPreviewSubscription?.unsubscribe();
    this.loadingPdfPreview.set(false);
    this.revokeCurrentPdfPreviewUrl();
    this.pdfPreviewUrl.set(null);
  }

  private revokeCurrentPdfPreviewUrl(): void {
    const url = this.pdfPreviewUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }
  }

  // Auto-entrepreneur/micro-entreprise: franchise en base, no rate to pick —
  // confirms immediately. "Société": reveals the rate picker below instead
  // of guessing, since the right rate genuinely varies per activité.
  protected confirmMicroEntrepreneur(): void {
    this.confirmLegalStatus('MICRO_ENTREPRENEUR');
  }

  protected revealVatRatePicker(): void {
    this.showVatRatePicker.set(true);
  }

  protected confirmCompany(vatRateBasisPoints: number): void {
    this.confirmLegalStatus('COMPANY', vatRateBasisPoints);
  }

  private confirmLegalStatus(legalStatus: LegalStatus, vatRateBasisPoints?: number): void {
    if (this.confirmingLegalStatus()) {
      return;
    }
    this.confirmingLegalStatus.set(true);
    this.draftStore.confirmLegalStatus(legalStatus, vatRateBasisPoints).subscribe({
      next: () => this.confirmingLegalStatus.set(false),
      error: () => {
        this.confirmingLegalStatus.set(false);
        this.toastService.error('Impossible de confirmer votre régime de TVA pour le moment.');
      },
    });
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
}
