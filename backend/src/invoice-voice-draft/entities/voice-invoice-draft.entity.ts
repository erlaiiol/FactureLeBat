import { DocumentType, Unit } from '../../../generated/prisma/enums';

// Phase 1.4-1: why a field is uncertain and, where one exists, what to
// suggest instead — never a reason to withhold the field's best-effort
// value, always attached alongside it. See docs/1.4/1.4-1's Approach
// section for what each reason means and when the model must use it.
export type NeedsReviewReason =
  'no_match' | 'ambiguous_match' | 'low_confidence_match' | 'document_type_conflict';

export const NEEDS_REVIEW_REASONS: NeedsReviewReason[] = [
  'no_match',
  'ambiguous_match',
  'low_confidence_match',
  'document_type_conflict',
];

export interface NeedsReviewSuggestion {
  label: string;
  // A real id (customer/product/service) for ambiguous_match/
  // low_confidence_match once re-validated server-side — never trusted
  // as-is from the model. Free text (e.g. a proposed unit price) for a
  // suggestion with nothing to look up.
  value: string;
}

export interface NeedsReview {
  reason: NeedsReviewReason;
  suggestion?: NeedsReviewSuggestion;
}

export interface VoiceDraftCustomer {
  // Set only once re-validated against this company's own Customer table
  // (see InvoiceVoiceDraftService.validateDraft) — never trusted straight
  // from the model's tool call.
  customerId?: string;
  customerName: string;
  customerAddress?: string;
  customerEmail?: string;
  customerPhone?: string;
  needsReview?: NeedsReview;
}

export interface VoiceDraftLine {
  description: string;
  unit: Unit;
  quantity: number;
  unitPriceCents: number;
  // Same re-validation rule as VoiceDraftCustomer.customerId.
  productId?: string;
  needsReview?: NeedsReview;
}

export interface VoiceDraftServiceLine {
  // Same re-validation rule as VoiceDraftCustomer.customerId.
  serviceId?: string;
  name: string;
  description?: string;
  amountCents: number;
  needsReview?: NeedsReview;
}

// A dictated detail with no corresponding field on this draft at all (a
// remise, a VAT override) — not a field flag, since nothing was added to
// the draft to attach one to. Rendered as a banner, not a highlight (1.4-2).
export interface VoiceDraftNotice {
  detail: string;
  message: string;
}

export interface VoiceInvoiceDraft {
  documentType: DocumentType;
  documentTypeNeedsReview?: NeedsReview;
  customer: VoiceDraftCustomer;
  lines: VoiceDraftLine[];
  serviceLines: VoiceDraftServiceLine[];
  depositPercentageBasisPoints?: number;
  depositNeedsReview?: NeedsReview;
  notices: VoiceDraftNotice[];
}

// The endpoint's only two outcomes — no third "clarify, wait for an
// answer" status, see this doc's 2026-08-29 revision note: correction
// happens by the artisan editing the rendered draft directly (1.4-2), not
// by a second call to this service.
export type VoiceDraftResult =
  { status: 'resolved'; draft: VoiceInvoiceDraft } | { status: 'rejected'; message: string };
