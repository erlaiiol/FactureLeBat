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
import { Subscription, switchMap, TimeoutError } from 'rxjs';
import { CompanyProfile } from '../../../core/models/company.model';
import { getMissingCompanyEssentials } from '../../../core/models/company-essentials.util';
import { InvoiceWithTotals } from '../../../core/models/invoice.model';
import { BillingService } from '../../../core/services/billing.service';
import { CompanyEssentialsGateService } from '../../../core/services/company-essentials-gate.service';
import { CompanyService } from '../../../core/services/company.service';
import { InvoiceService } from '../../../core/services/invoice.service';
import { InvoiceShareService } from '../../../core/services/invoice-share.service';
import { ToastService } from '../../../core/services/toast.service';
import { TrialOfferService } from '../../../core/services/trial-offer.service';
import { BigButtonComponent } from '../../../shared/components/big-button.component';
import { IconCheckComponent } from '../../../shared/components/icon-check.component';
import { IconEyeComponent } from '../../../shared/components/icon-eye.component';
import { IconEyeOffComponent } from '../../../shared/components/icon-eye-off.component';
import { PdfPreviewModalComponent } from '../../../shared/components/pdf-preview-modal.component';
import { CentsToEurosPipe } from '../../../shared/pipes/cents-to-euros.pipe';
import { UnitLabelPipe } from '../../../shared/pipes/unit-label.pipe';
import { SendInvoiceEmailModalComponent } from '../../../shared/components/send-invoice-email-modal.component';
import { SignatureModalComponent } from '../../../shared/components/signature-modal.component';
import { TourAnchorDirective } from '../../../shared/tour/tour-anchor.directive';
import { TypewriterTextComponent } from '../../../shared/components/typewriter-text.component';
import { delayedSkeleton } from '../../../shared/utils/delayed-skeleton';
import { showTrialOfferAfterFirstInvoice } from '../../../shared/utils/trial-offer-trigger';
import { InvoiceDepositFieldComponent } from '../components/invoice-deposit-field.component';
import { SimplifiedDisplaySliderComponent } from '../components/simplified-display-slider.component';
import { InvoiceDraftStore } from '../invoice-draft.store';

// The 3 easy-to-miss toggles highlighted at the top of this page — content
// is always shown for all 3, but the order their typewriter subtitle "types
// itself in" (see hintState/onHintTyped) is reshuffled on every visit, to
// nudge artisans into actually reading them over time without ever risking
// one silently not appearing (see the acompte-carried-over-from-devis
// incident this replaced a random-content idea for). Strictly sequential —
// each one only starts once the previous has fully typed (onHintTyped
// advances hintProgress), never several at once.
const HINT_KEYS = ['simplifiedDisplay', 'deposit', 'reverseCharge'] as const;
type HintKey = (typeof HINT_KEYS)[number];

// deposit's own subtitle text lives on InvoiceDepositFieldComponent
// (it owns that field's whole template) — these two are the only ones
// rendered directly in this page's own template, in both their 'active'
// (typewriter) and 'done' (static) states, hence centralized here rather
// than inlined twice.
const HINT_TEXT: Record<'simplifiedDisplay' | 'reverseCharge', string> = {
  simplifiedDisplay:
    "Choisissez le niveau de détail affiché sur le document envoyé au client : complet, simplifié (nom + prix total), ou minimal (une seule ligne). Le calcul et le total ne changent jamais, seul l'affichage change.",
  reverseCharge:
    "La TVA n'est pas facturée par vous, mais autoliquidée par votre client — réservé à la sous-traitance BTP (art. 242 nonies A, 13° de l'annexe II au CGI).",
};

function shuffledHintOrder(): HintKey[] {
  const keys = [...HINT_KEYS];
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  return keys;
}

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
    IconCheckComponent,
    IconEyeComponent,
    IconEyeOffComponent,
    CentsToEurosPipe,
    UnitLabelPipe,
    PdfPreviewModalComponent,
    SendInvoiceEmailModalComponent,
    SignatureModalComponent,
    TourAnchorDirective,
    InvoiceDepositFieldComponent,
    SimplifiedDisplaySliderComponent,
    TypewriterTextComponent,
  ],
  templateUrl: './invoice-create-preview-step.page.html',
})
export class InvoiceCreatePreviewStepPage {
  private readonly invoiceService = inject(InvoiceService);
  private readonly invoiceShareService = inject(InvoiceShareService);
  private readonly companyEssentialsGate = inject(CompanyEssentialsGateService);
  protected readonly companyService = inject(CompanyService);
  protected readonly billingService = inject(BillingService);
  private readonly toastService = inject(ToastService);
  private readonly trialOfferService = inject(TrialOfferService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  protected readonly draftStore = inject(InvoiceDraftStore);

  protected readonly today = new Date();

  // Mirrors PdfService's GENERIC_LINE_LABEL — this HTML mirror must never
  // disagree with what the real PDF prints for the same level.
  protected readonly genericLineLabel = 'Prestation';

  // Fresh component instance per navigation to this route (see the route
  // config), so this reshuffles on every visit — see HINT_KEYS' doc comment.
  private readonly hintOrder = shuffledHintOrder();
  protected readonly hintProgress = signal(0);

  protected hintState(key: HintKey): 'pending' | 'active' | 'done' {
    const index = this.hintOrder.indexOf(key);
    const progress = this.hintProgress();
    if (index < progress) {
      return 'done';
    }
    return index === progress ? 'active' : 'pending';
  }

  protected onHintTyped(): void {
    this.hintProgress.update((value) => value + 1);
  }

  protected hintText(key: 'simplifiedDisplay' | 'reverseCharge'): string {
    return HINT_TEXT[key];
  }

  protected readonly loading = signal(true);
  protected readonly showSkeleton = delayedSkeleton(this.loading);
  protected readonly loadError = signal<string | null>(null);
  protected readonly previewData = signal<InvoiceWithTotals | null>(null);

  // Best-effort, non-blocking: a company profile fetch failure must never
  // stop the artisan from previewing/sending their document — it only ever
  // suppresses this warning. First-invoice-pipeline reversal: name/SIRET/
  // address are no longer forced before this screen is reached (see
  // CompanyEssentialsGateService, which gates the actual send/download
  // actions below instead) — this stays as the passive, on-screen "here's
  // what's still missing" companion to that hard gate, same
  // isCompanyEssentialsComplete util both use.
  private readonly companyProfile = signal<CompanyProfile | null>(null);
  protected readonly missingEssentials = computed(() => {
    const profile = this.companyProfile();
    return profile ? getMissingCompanyEssentials(profile) : [];
  });
  // Same document-mirror-only concern as companyProfile above — the
  // top-right logo (see PdfService.buildHeader) shown here purely so this
  // HTML mirror stays a faithful preview of the real PDF.
  protected readonly hasLogo = signal(false);

  protected readonly previewLines = computed(() => this.previewData()?.lines ?? []);
  // Mirrors PdfService's own rule: only VISIBLE service lines get their own
  // row — a REDISTRIBUTED one is already folded into the lines above.
  protected readonly visibleServiceLines = computed(() =>
    (this.previewData()?.serviceLines ?? []).filter((line) => line.visibility === 'VISIBLE'),
  );
  protected readonly previewDiscountLines = computed(() => this.previewData()?.discountLines ?? []);
  // Same "reconstruct the pre-discount figure for display" approach as
  // InvoiceTotalsSummaryComponent — subtotalExclVatCents is already net of
  // every discount line.
  protected readonly discountTotalCents = computed(() =>
    this.previewDiscountLines().reduce((sum, discount) => sum + discount.amountCents, 0),
  );

  protected readonly creating = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly createdInvoice = signal<InvoiceWithTotals | null>(null);
  protected readonly emailModalInvoice = signal<InvoiceWithTotals | null>(null);
  // Which button ('pdf' from share(), 'facturx' from shareFacturX()) opened
  // the compose-email modal — forwarded to it so the SMTP tier attaches the
  // same file the artisan actually asked for (InvoiceMailService.send).
  protected readonly emailModalFormat = signal<'pdf' | 'facturx'>('pdf');
  protected readonly sharingInvoiceId = signal<string | null>(null);
  // 2026-08-25 review: mirrors sharingInvoiceId, kept as its own signal
  // rather than widening that one with a format field — a plain-PDF share
  // and a Factur-X share are independent in-flight operations (an artisan
  // could plausibly tap one right after the other) and each button only
  // ever needs to know about its own.
  protected readonly sharingFacturXInvoiceId = signal<string | null>(null);
  // Phase 1.1-1
  protected readonly signatureModalInvoice = signal<InvoiceWithTotals | null>(null);

  // Phase 14.3: the "Créer la facture aussi immédiatement ?" prompt shown
  // after a devis is created — see convertToFacture below. Phase 23: on
  // success this no longer replaces createdInvoice (which would make the
  // devis unreachable/undownloadable right after converting it) — the new
  // facture surfaces alongside it instead, see convertedFacture below.
  protected readonly converting = signal(false);
  protected readonly conversionDeclined = signal(false);
  protected readonly convertedFacture = signal<InvoiceWithTotals | null>(null);

  // Secondary affordance: the artisan can still open the exact, real PDF
  // (same app-pdf-preview-modal Phase 6 already used) as a fidelity check
  // alongside this HTML mirror — never the primary interaction surface.
  protected readonly downloadingPdf = signal(false);
  protected readonly pdfPreviewUrl = signal<string | null>(null);
  private pdfPreviewSubscription?: Subscription;

  constructor() {
    this.destroyRef.onDestroy(() => this.revokeCurrentPdfPreviewUrl());

    if (!this.draftStore.canPreview()) {
      // Reached directly (refresh, back/forward) on an empty/incomplete
      // draft — nothing meaningful to preview, so send the artisan back to
      // finish the lines step rather than rendering a broken document.
      void this.router.navigate(['/factures/nouvelle/rapide/lignes']);
      return;
    }
    this.draftStore.ensureNumberSuggestion();
    this.loadPreview();
    this.companyService
      .getProfile()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (profile) => {
          this.companyProfile.set(profile);
          this.hasLogo.set(profile.hasLogo);
        },
        // Silent: see companyProfile's comment above.
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

  // Phase 1.1-3: typing directly into the deposit's amount field freezes its
  // automatic link to the percentage × total — the one-time warning toast
  // the user asked for lives here (the store just reports whether this edit
  // is what triggered it, see InvoiceDraftStore.setDepositAmountOverride).
  protected onDepositAmountChange(amountEuros: number): void {
    const justFroze = this.draftStore.setDepositAmountOverride(amountEuros);
    if (justFroze) {
      this.toastService.info(
        "Le montant de l'acompte ne se recalcule plus automatiquement — cliquez sur « Réinitialiser » pour reprendre le calcul automatique.",
      );
    }
  }

  protected back(): void {
    void this.router.navigate(['/factures/nouvelle/rapide/lignes']);
  }

  // First-invoice-pipeline reversal: deliberately NOT gated by
  // CompanyEssentialsGateService — same reasoning as
  // InvoiceCreateShellPage.openPdfPreview(), this is a pre-creation, nothing-
  // sent-to-anyone preview. Gating the artisan's own "let me see it" moment
  // would undercut the whole point of no longer blocking on admin fields.
  protected downloadPdfPreview(): void {
    if (this.downloadingPdf()) {
      return;
    }
    this.downloadingPdf.set(true);
    const request = this.draftStore.buildInvoiceRequest(
      this.draftStore.customer().customerId ?? undefined,
    );
    this.pdfPreviewSubscription = this.invoiceService
      .previewPdf(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.downloadingPdf.set(false);
          this.revokeCurrentPdfPreviewUrl();
          this.pdfPreviewUrl.set(URL.createObjectURL(blob));
        },
        error: (error: HttpErrorResponse | TimeoutError) => {
          this.downloadingPdf.set(false);
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
    this.downloadingPdf.set(false);
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

  // Phase 1.2/1.3 review (2026-08-25): FACTURE-only — callers must gate
  // this on documentType themselves, same convention InvoiceService.
  // facturXUrl's own doc comment already establishes.
  protected facturXUrl(invoiceId: string): string {
    return this.invoiceService.facturXUrl(invoiceId);
  }

  // Guards the plain <a [href]="pdfUrl(...)" target="_blank"> download
  // links (unlike share()/downloadPdfPreview() above, there's no method
  // call to intercept — just a real navigation) — reads the href straight
  // off the anchor itself rather than needing to know which invoice this
  // is, so one handler covers both the devis and the converted-facture link.
  protected guardDownloadClick(event: MouseEvent): void {
    const href = (event.currentTarget as HTMLAnchorElement).href;
    if (
      !this.companyEssentialsGate.ensureComplete(this.companyProfile(), (profile) => {
        this.companyProfile.set(profile);
        window.open(href, '_blank');
      })
    ) {
      event.preventDefault();
    }
  }

  protected openEmailModal(invoice: InvoiceWithTotals, format: 'pdf' | 'facturx' = 'pdf'): void {
    this.emailModalFormat.set(format);
    this.emailModalInvoice.set(invoice);
  }

  protected async share(invoice: InvoiceWithTotals): Promise<void> {
    if (this.sharingInvoiceId()) {
      return;
    }
    if (
      !this.companyEssentialsGate.ensureComplete(this.companyProfile(), (profile) => {
        this.companyProfile.set(profile);
        void this.share(invoice);
      })
    ) {
      return;
    }
    this.sharingInvoiceId.set(invoice.id);
    try {
      const outcome = await this.invoiceShareService.share(invoice);
      if (outcome === 'compose-email') {
        this.openEmailModal(invoice);
      }
    } catch {
      this.toastService.error('Impossible de partager ce document pour le moment.');
    } finally {
      this.sharingInvoiceId.set(null);
    }
  }

  // 2026-08-25 review: same three-tier fallback as share() above, just
  // pointed at the Factur-X hybrid — FACTURE-only, callers gate on
  // documentType (see the template's own @if before this button).
  protected async shareFacturX(invoice: InvoiceWithTotals): Promise<void> {
    if (this.sharingFacturXInvoiceId()) {
      return;
    }
    if (
      !this.companyEssentialsGate.ensureComplete(this.companyProfile(), (profile) => {
        this.companyProfile.set(profile);
        void this.shareFacturX(invoice);
      })
    ) {
      return;
    }
    this.sharingFacturXInvoiceId.set(invoice.id);
    try {
      const outcome = await this.invoiceShareService.share(invoice, 'facturx');
      if (outcome === 'compose-email') {
        this.openEmailModal(invoice, 'facturx');
      }
    } catch {
      this.toastService.error('Impossible de partager la facture électronique pour le moment.');
    } finally {
      this.sharingFacturXInvoiceId.set(null);
    }
  }

  protected closeEmailModal(): void {
    this.emailModalInvoice.set(null);
  }

  // `actionConfirmMorph` (docs/design-system.md): the button itself confirms
  // the copy inline (checkmark + "Copié !", self-reverting) instead of a
  // toast — tighter feedback right where the artisan is already looking,
  // so the toast is dropped for the success case (the error path still
  // needs one, since there's a real message to convey there).
  protected readonly copiedEmail = signal<string | null>(null);

  // Phase 1.1-11 follow-up: the native Web Share tier has no recipient
  // parameter at all (see InvoiceShareService's own doc comment) — this is
  // the artisan's fallback to get the client's email into whichever app
  // "Partager" opened, without retyping it. Clipboard access can be denied
  // by the browser; the email is also shown as plain, selectable text right
  // next to the button, so this is a convenience, never the only way to
  // get it.
  protected async copyCustomerEmail(email: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(email);
      this.copiedEmail.set(email);
      setTimeout(() => this.copiedEmail.set(null), 1600);
    } catch {
      this.toastService.error(
        'Impossible de copier automatiquement — sélectionnez le texte à la main.',
      );
    }
  }

  protected openSignatureModal(invoice: InvoiceWithTotals): void {
    this.signatureModalInvoice.set(invoice);
  }

  protected closeSignatureModal(): void {
    this.signatureModalInvoice.set(null);
  }

  protected onSignatureSaved(updated: InvoiceWithTotals): void {
    if (this.convertedFacture()?.id === updated.id) {
      this.convertedFacture.set(updated);
    } else {
      this.createdInvoice.set(updated);
    }
    this.signatureModalInvoice.set(null);
    this.toastService.success('Signature enregistrée.');
  }

  protected onEmailSent(updated: InvoiceWithTotals): void {
    if (this.convertedFacture()?.id === updated.id) {
      this.convertedFacture.set(updated);
    } else {
      this.createdInvoice.set(updated);
    }
    this.emailModalInvoice.set(null);
    this.toastService.success('Email envoyé au client.');
  }

  protected startNewInvoice(): void {
    this.createdInvoice.set(null);
    this.convertedFacture.set(null);
    this.errorMessage.set(null);
    this.conversionDeclined.set(false);
    this.draftStore.reset();
    void this.router.navigate(['/factures/nouvelle/rapide/client']);
  }

  // Phase 14.3: "Créer la facture aussi immédiatement ?" — accepting reuses
  // the devis's own already-confirmed data (see InvoiceService.convertToFacture
  // on the backend). Phase 23: the new facture is shown alongside the devis
  // (fading in above it, see the template) rather than replacing it — the
  // devis stays reachable/downloadable from this same screen afterwards.
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
          this.convertedFacture.set(facture);
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

  // "Créer la facture à partir du devis": unlike convertToFacture above (an
  // untouched, already-persisted clone), this re-enters the wizard
  // pre-filled from the just-created devis so the artisan can adjust
  // anything — quantities, lines, the client's actual answer — before a
  // facture is ever created. This devis was authored in mode rapide, so the
  // target is always the rapide lignes step, never client (see
  // InvoiceCreateShellPage.cameFromDevis).
  protected editBeforeInvoicing(): void {
    const devis = this.createdInvoice();
    if (!devis) {
      return;
    }
    void this.router.navigate(['/factures/nouvelle/rapide/lignes'], {
      queryParams: { type: 'FACTURE', fromDevisId: devis.id },
    });
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
          showTrialOfferAfterFirstInvoice(this.billingService, this.trialOfferService);
        },
        error: (error: HttpErrorResponse) => {
          this.creating.set(false);
          // Phase 14: a 402 here means the free-trial invoice is already
          // used up — premiumGateInterceptor already showed the paywall
          // modal, so this just skips the generic message.
          if (error.status === 402) {
            return;
          }
          // Phase 27: same "surface the actual reason" rule as
          // InvoiceCreateManualPage.submit — a custom/typed number already
          // used by this company.
          if (error.status === 409) {
            this.errorMessage.set(error.error?.message ?? 'Ce numéro est déjà utilisé.');
            return;
          }
          this.errorMessage.set('Erreur lors de la création de la facture. Veuillez réessayer.');
        },
      });
  }
}
