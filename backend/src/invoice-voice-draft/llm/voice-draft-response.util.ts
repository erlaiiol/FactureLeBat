import { DocumentType, Unit } from '../../../generated/prisma/enums';
import { UNIT_LABELS } from '../../common/unit.util';
import { RawVoiceDraftInput } from '../draft-resolver.interface';
import {
  NEEDS_REVIEW_REASONS,
  NeedsReview,
  NeedsReviewReason,
} from '../entities/voice-invoice-draft.entity';

const VALID_UNITS = new Set(Object.keys(UNIT_LABELS));
const VALID_DOCUMENT_TYPES = new Set<string>(['DEVIS', 'FACTURE']);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseOptionalString(value: unknown): string | undefined {
  return isNonEmptyString(value) ? value : undefined;
}

function parseNeedsReview(value: unknown): NeedsReview | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const reason = (value as Record<string, unknown>).reason;
  if (typeof reason !== 'string' || !NEEDS_REVIEW_REASONS.includes(reason as NeedsReviewReason)) {
    return undefined;
  }
  const suggestionRaw = (value as Record<string, unknown>).suggestion;
  if (suggestionRaw && typeof suggestionRaw === 'object') {
    const label = (suggestionRaw as Record<string, unknown>).label;
    const suggestionValue = (suggestionRaw as Record<string, unknown>).value;
    if (typeof label === 'string' && typeof suggestionValue === 'string') {
      return { reason: reason as NeedsReviewReason, suggestion: { label, value: suggestionValue } };
    }
  }
  return { reason: reason as NeedsReviewReason };
}

// Returns null on any structural failure — the caller (LlmDraftResolverService)
// treats that the same as an explicit reject, never as a 500: malformed
// tool output from an LLM is an expected failure mode to degrade out of
// gracefully, not a bug to crash on. Only this file's own engine
// (resolve_draft's tool-call JSON) needs this parsing step at all — the
// rule-based engine constructs a RawVoiceDraftInput directly in code, not
// from untrusted external JSON, so it has no equivalent of this function.
export function parseResolveDraftInput(input: unknown): RawVoiceDraftInput | null {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const raw = input as Record<string, unknown>;

  if (typeof raw.documentType !== 'string' || !VALID_DOCUMENT_TYPES.has(raw.documentType)) {
    return null;
  }

  const customerRaw = raw.customer;
  if (!customerRaw || typeof customerRaw !== 'object') {
    return null;
  }
  const customer = customerRaw as Record<string, unknown>;
  if (!isNonEmptyString(customer.customerName)) {
    return null;
  }

  if (!Array.isArray(raw.lines)) {
    return null;
  }
  const lines: RawVoiceDraftInput['lines'] = [];
  for (const lineRaw of raw.lines) {
    if (!lineRaw || typeof lineRaw !== 'object') {
      return null;
    }
    const line = lineRaw as Record<string, unknown>;
    if (
      !isNonEmptyString(line.description) ||
      typeof line.unit !== 'string' ||
      !VALID_UNITS.has(line.unit) ||
      typeof line.quantity !== 'number' ||
      typeof line.unitPriceCents !== 'number'
    ) {
      return null;
    }
    lines.push({
      description: line.description,
      unit: line.unit as Unit,
      quantity: line.quantity,
      unitPriceCents: Math.round(line.unitPriceCents),
      productId: parseOptionalString(line.productId),
      needsReview: parseNeedsReview(line.needsReview),
    });
  }

  if (!Array.isArray(raw.serviceLines)) {
    return null;
  }
  const serviceLines: RawVoiceDraftInput['serviceLines'] = [];
  for (const serviceLineRaw of raw.serviceLines) {
    if (!serviceLineRaw || typeof serviceLineRaw !== 'object') {
      return null;
    }
    const serviceLine = serviceLineRaw as Record<string, unknown>;
    if (!isNonEmptyString(serviceLine.name) || typeof serviceLine.amountCents !== 'number') {
      return null;
    }
    serviceLines.push({
      name: serviceLine.name,
      description: parseOptionalString(serviceLine.description),
      amountCents: Math.round(serviceLine.amountCents),
      serviceId: parseOptionalString(serviceLine.serviceId),
      needsReview: parseNeedsReview(serviceLine.needsReview),
    });
  }

  const notices: RawVoiceDraftInput['notices'] = [];
  if (Array.isArray(raw.notices)) {
    for (const noticeRaw of raw.notices) {
      if (noticeRaw && typeof noticeRaw === 'object') {
        const notice = noticeRaw as Record<string, unknown>;
        if (isNonEmptyString(notice.detail) && isNonEmptyString(notice.message)) {
          notices.push({ detail: notice.detail, message: notice.message });
        }
      }
    }
  }

  return {
    documentType: raw.documentType as DocumentType,
    documentTypeNeedsReview: parseNeedsReview(raw.documentTypeNeedsReview),
    customer: {
      customerName: customer.customerName,
      customerId: parseOptionalString(customer.customerId),
      customerAddress: parseOptionalString(customer.customerAddress),
      customerEmail: parseOptionalString(customer.customerEmail),
      customerPhone: parseOptionalString(customer.customerPhone),
      needsReview: parseNeedsReview(customer.needsReview),
    },
    lines,
    serviceLines,
    depositPercentageBasisPoints:
      typeof raw.depositPercentageBasisPoints === 'number'
        ? Math.round(raw.depositPercentageBasisPoints)
        : undefined,
    depositNeedsReview: parseNeedsReview(raw.depositNeedsReview),
    notices,
  };
}
