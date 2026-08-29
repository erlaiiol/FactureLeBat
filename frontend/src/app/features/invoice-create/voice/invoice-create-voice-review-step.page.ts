import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DocumentType } from '../../../core/models/invoice.model';
import { NeedsReviewSuggestion } from '../../../core/models/voice-draft.model';
import { UNIT_OPTIONS } from '../../../core/models/unit.model';
import { ToastService } from '../../../core/services/toast.service';
import { IconCloseComponent } from '../../../shared/components/icon-close.component';
import { IconTrashComponent } from '../../../shared/components/icon-trash.component';
import { InvoiceDepositFieldComponent } from '../components/invoice-deposit-field.component';
import {
  InvoiceCustomerDraft,
  InvoiceDraftStore,
  InvoiceLineDraft,
  InvoiceServiceLineDraft,
} from '../invoice-draft.store';
import { NeedsReviewHintComponent } from './needs-review-hint.component';
import { VoiceDraftReviewStore } from './voice-draft-review.store';

// Phase 1.4-2: the screen a resolved voice/typed draft lands on, before
// the existing preview step — see docs/1.4/1.4-2's "Voice review screen —
// design". Routed as a `rapide` child (app.routes.ts), mounted inside
// InvoiceCreateShellPage exactly like `client`/`lignes`/`apercu` — the
// shell's totals footer and "Aperçu" button are already wired to
// InvoiceDraftStore and need no per-step setup to work here too.
//
// Deliberate deviation from the original design note ("reuse
// InvoiceLineFormComponent/InvoiceServiceLineFormComponent"): those are
// FormGroup-bound view components deeply coupled to lines-step's own
// catalog-flyout/gallery-card machinery (folder grouping, collapse state,
// quantity wheel picker) — built for a very different interaction
// (picking from a live catalog), not a good fit for lightly correcting an
// already-resolved draft. This page instead renders its own small,
// purpose-built editable rows, funneling into the exact same
// InvoiceDraftStore.setLines()/setServiceLines() — same data, same
// validation on submit, just simpler markup. app-invoice-deposit-field
// (a genuinely reusable, self-contained controlled component) IS reused
// as-is, unchanged.
@Component({
  selector: 'app-invoice-create-voice-review-step-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IconCloseComponent,
    IconTrashComponent,
    InvoiceDepositFieldComponent,
    NeedsReviewHintComponent,
  ],
  templateUrl: './invoice-create-voice-review-step.page.html',
})
export class InvoiceCreateVoiceReviewStepPage {
  private readonly toastService = inject(ToastService);
  protected readonly draftStore = inject(InvoiceDraftStore);
  protected readonly voiceDraftReviewStore = inject(VoiceDraftReviewStore);

  protected readonly unitOptions = UNIT_OPTIONS;

  protected setDocumentType(type: DocumentType): void {
    this.draftStore.setDocumentType(type);
    this.voiceDraftReviewStore.clearDocumentType();
  }

  protected documentTypeButtonClasses(type: DocumentType): string {
    const base = 'rounded-[2px] px-4 py-2 text-sm font-medium transition';
    return this.draftStore.documentType() === type
      ? `${base} bg-primary text-primary-fg`
      : `${base} bg-secondary-subtle/40 text-ink-soft hover:bg-secondary-subtle hover:text-ink`;
  }

  protected updateCustomer(patch: Partial<InvoiceCustomerDraft>): void {
    this.draftStore.setCustomer({ ...this.draftStore.customer(), ...patch });
    this.voiceDraftReviewStore.clearCustomer();
  }

  // Applying a customer suggestion looks up the full saved record (already
  // cached by InvoiceDraftStore.customers, no new HTTP call needed) so
  // address/email/phone come along too, not just the name shown in the
  // caption — falls back to the label alone if the cache doesn't have it
  // for some reason (e.g. not loaded yet), same graceful-degrade spirit as
  // everywhere else in this feature.
  protected applyCustomerSuggestion(suggestion: NeedsReviewSuggestion): void {
    const match = this.draftStore.customers().find((customer) => customer.id === suggestion.value);
    this.updateCustomer(
      match
        ? {
            customerId: match.id,
            customerName: match.name,
            customerAddress: match.address ?? '',
            customerEmail: match.email ?? '',
            customerPhone: match.phone ?? '',
          }
        : { customerName: suggestion.label },
    );
  }

  protected updateLine(index: number, patch: Partial<InvoiceLineDraft>): void {
    this.draftStore.setLines(
      this.draftStore.lines().map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
    this.voiceDraftReviewStore.clearLine(index);
  }

  protected applyLineSuggestion(index: number, suggestion: NeedsReviewSuggestion): void {
    const match = this.draftStore.products().find((product) => product.id === suggestion.value);
    this.updateLine(
      index,
      match
        ? {
            productId: match.id,
            description: match.name,
            unit: match.unit,
            unitPriceEuros: match.priceCents / 100,
          }
        : { description: suggestion.label },
    );
  }

  protected removeLine(index: number): void {
    this.draftStore.setLines(this.draftStore.lines().filter((_, i) => i !== index));
    this.voiceDraftReviewStore.removeLine(index);
  }

  protected updateServiceLine(index: number, patch: Partial<InvoiceServiceLineDraft>): void {
    this.draftStore.setServiceLines(
      this.draftStore.serviceLines().map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
    this.voiceDraftReviewStore.clearServiceLine(index);
  }

  protected applyServiceLineSuggestion(index: number, suggestion: NeedsReviewSuggestion): void {
    const match = this.draftStore.services().find((service) => service.id === suggestion.value);
    this.updateServiceLine(
      index,
      match && match.pricingMode === 'FIXED' && match.priceCents != null
        ? { serviceId: match.id, name: match.name, amountEuros: match.priceCents / 100 }
        : { name: suggestion.label },
    );
  }

  protected removeServiceLine(index: number): void {
    this.draftStore.setServiceLines(this.draftStore.serviceLines().filter((_, i) => i !== index));
    this.voiceDraftReviewStore.removeServiceLine(index);
  }

  protected onDepositRequestedChange(requested: boolean): void {
    this.draftStore.setDepositRequested(requested);
    this.voiceDraftReviewStore.clearDeposit();
  }

  protected onDepositPercentageChange(basisPoints: number): void {
    this.draftStore.setDepositPercentage(basisPoints);
    this.voiceDraftReviewStore.clearDeposit();
  }

  // Same toast-on-freeze convention as InvoiceCreatePreviewStepPage's own
  // onDepositAmountChange, reusing the exact same store method — the two
  // pages happen to duplicate this one small handler rather than sharing
  // it, same as they already independently mount app-invoice-deposit-field
  // itself.
  protected onDepositAmountChange(amountEuros: number): void {
    const justFroze = this.draftStore.setDepositAmountOverride(amountEuros);
    this.voiceDraftReviewStore.clearDeposit();
    if (justFroze) {
      this.toastService.info(
        "Le montant de l'acompte ne se recalcule plus automatiquement — cliquez sur « Réinitialiser » pour reprendre le calcul automatique.",
      );
    }
  }
}
