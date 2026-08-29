import { Injectable, signal } from '@angular/core';
import {
  NeedsReview,
  VoiceDraftNotice,
  VoiceInvoiceDraft,
} from '../../../core/models/voice-draft.model';

// Phase 1.4-2: the `needsReview`/`notices` annotations a resolved
// VoiceInvoiceDraft carries alongside its values — deliberately NOT stored
// on InvoiceDraftStore itself (InvoiceCustomerDraft/InvoiceLineDraft have
// no such field, and every other mode rapide/manuel screen would have to
// account for a flag that's meaningless to them). This is a second,
// narrower singleton purely for the one screen that renders these
// highlights (invoice-create-voice-review-step.page.ts), written once by
// the capture page right before navigating there, cleared once the
// artisan leaves that screen having resolved every flag (or abandons the
// draft entirely via mode-choice's own InvoiceDraftStore.reset()).
//
// Line/service-line reviews are plain arrays, positionally aligned with
// InvoiceDraftStore.lines()/serviceLines() by index — safe here because
// the review screen is this data's only consumer and only ever
// edits/removes a line by index, never reorders one (see the review
// page's own remove* methods, which splice both arrays in lockstep).
@Injectable({ providedIn: 'root' })
export class VoiceDraftReviewStore {
  readonly active = signal(false);
  readonly documentTypeNeedsReview = signal<NeedsReview | undefined>(undefined);
  readonly customerNeedsReview = signal<NeedsReview | undefined>(undefined);
  readonly depositNeedsReview = signal<NeedsReview | undefined>(undefined);
  readonly lineNeedsReview = signal<Array<NeedsReview | undefined>>([]);
  readonly serviceLineNeedsReview = signal<Array<NeedsReview | undefined>>([]);
  readonly notices = signal<VoiceDraftNotice[]>([]);

  activate(draft: VoiceInvoiceDraft): void {
    this.active.set(true);
    this.documentTypeNeedsReview.set(draft.documentTypeNeedsReview);
    this.customerNeedsReview.set(draft.customer.needsReview);
    this.depositNeedsReview.set(draft.depositNeedsReview);
    this.lineNeedsReview.set(draft.lines.map((line) => line.needsReview));
    this.serviceLineNeedsReview.set(draft.serviceLines.map((line) => line.needsReview));
    this.notices.set(draft.notices);
  }

  clearDocumentType(): void {
    this.documentTypeNeedsReview.set(undefined);
  }

  clearCustomer(): void {
    this.customerNeedsReview.set(undefined);
  }

  clearDeposit(): void {
    this.depositNeedsReview.set(undefined);
  }

  clearLine(index: number): void {
    this.lineNeedsReview.update((flags) =>
      flags.map((flag, i) => (i === index ? undefined : flag)),
    );
  }

  removeLine(index: number): void {
    this.lineNeedsReview.update((flags) => flags.filter((_, i) => i !== index));
  }

  clearServiceLine(index: number): void {
    this.serviceLineNeedsReview.update((flags) =>
      flags.map((flag, i) => (i === index ? undefined : flag)),
    );
  }

  removeServiceLine(index: number): void {
    this.serviceLineNeedsReview.update((flags) => flags.filter((_, i) => i !== index));
  }

  dismissNotice(index: number): void {
    this.notices.update((notices) => notices.filter((_, i) => i !== index));
  }

  reset(): void {
    this.active.set(false);
    this.documentTypeNeedsReview.set(undefined);
    this.customerNeedsReview.set(undefined);
    this.depositNeedsReview.set(undefined);
    this.lineNeedsReview.set([]);
    this.serviceLineNeedsReview.set([]);
    this.notices.set([]);
  }
}
