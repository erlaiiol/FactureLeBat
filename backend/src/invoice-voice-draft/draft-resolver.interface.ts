import { DocumentType, Unit } from '../../generated/prisma/enums';
import { NeedsReview } from './entities/voice-invoice-draft.entity';

// The shape any resolution engine (rule-based today, an LLM tool loop when
// re-enabled — see llm/llm-draft-resolver.service.ts) produces, *before*
// InvoiceVoiceDraftService's server-side re-validation pass
// (validateDraft/resolveCustomer/resolveLine/resolveServiceLine) turns it
// into a trusted VoiceInvoiceDraft. Deliberately mirrors
// VoiceInvoiceDraft's own field names one-for-one (see
// entities/voice-invoice-draft.entity.ts) so that re-validation is a plain
// field-by-field pass regardless of which engine produced the input — an
// id here is never assumed to actually belong to this company yet, from
// either engine.
export interface RawVoiceDraftInput {
  documentType: DocumentType;
  documentTypeNeedsReview?: NeedsReview;
  customer: {
    customerId?: string;
    customerName: string;
    customerAddress?: string;
    customerEmail?: string;
    customerPhone?: string;
    needsReview?: NeedsReview;
  };
  lines: Array<{
    description: string;
    unit: Unit;
    quantity: number;
    unitPriceCents: number;
    productId?: string;
    needsReview?: NeedsReview;
  }>;
  serviceLines: Array<{
    serviceId?: string;
    name: string;
    description?: string;
    amountCents: number;
    needsReview?: NeedsReview;
  }>;
  depositPercentageBasisPoints?: number;
  depositNeedsReview?: NeedsReview;
  notices: Array<{ detail: string; message: string }>;
}

export type DraftResolverOutcome =
  { status: 'resolved'; draft: RawVoiceDraftInput } | { status: 'rejected'; message: string };

// The engine boundary — same "generic interface, one bound implementation,
// swappable via DI token" shape as llm/llm-client.interface.ts's
// LlmClient, one level up: a DraftResolver turns a transcript into a
// RawVoiceDraftInput (or a rejection) by whatever means it wants (regex
// heuristics, an LLM tool loop, anything else later); InvoiceVoiceDraftService
// never knows which. Bound today to RuleBasedDraftResolverService — free,
// always available, no external dependency — per the 2026-08-29 decision
// that an invoicing app shouldn't require an LLM subscription just to
// exist. LlmDraftResolverService implements this same interface and stays
// fully wired/tested but unbound ("dormant") until there's a reason to
// re-enable it (see docs/1.4/1.4-1's revision note).
export interface DraftResolver {
  isAvailable(): boolean;
  resolve(companyId: string, transcript: string): Promise<DraftResolverOutcome>;
}

export const DRAFT_RESOLVER = Symbol('DRAFT_RESOLVER');
