import { DocumentType } from './invoice.model';
import { Unit } from './unit.model';

// Phase 1.4-1/1.4-2: mirrors the backend's VoiceInvoiceDraft/NeedsReview
// shape exactly (backend/src/invoice-voice-draft/entities/voice-invoice-draft.entity.ts)
// — see docs/1.4/1.4-1-nlu-draft-backend.md for what each reason means and
// when the resolving engine uses it.
export type NeedsReviewReason =
  'no_match' | 'ambiguous_match' | 'low_confidence_match' | 'document_type_conflict';

export interface NeedsReviewSuggestion {
  label: string;
  value: string;
}

export interface NeedsReview {
  reason: NeedsReviewReason;
  suggestion?: NeedsReviewSuggestion;
}

export interface VoiceDraftCustomer {
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
  productId?: string;
  needsReview?: NeedsReview;
}

export interface VoiceDraftServiceLine {
  serviceId?: string;
  name: string;
  description?: string;
  amountCents: number;
  needsReview?: NeedsReview;
}

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

export type VoiceDraftResponse =
  { status: 'resolved'; draft: VoiceInvoiceDraft } | { status: 'rejected'; message: string };
