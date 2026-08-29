import { Injectable } from '@nestjs/common';
import { CompanyRepository } from '../../company/company.repository';
import { CustomerService } from '../../customer/customer.service';
import { ProductService } from '../../product/product.service';
import { ServiceCatalogService } from '../../service-catalog/service-catalog.service';
import {
  DraftResolver,
  DraftResolverOutcome,
  RawVoiceDraftInput,
} from '../draft-resolver.interface';
import { NeedsReview } from '../entities/voice-invoice-draft.entity';
import { REJECTED_MESSAGE } from '../invoice-voice-draft.constants';
import { pickBestMatch } from './fuzzy-confidence.util';
import {
  detectDeposit,
  detectDocumentType,
  extractCustomerNameCandidate,
  extractLineCandidates,
  hasNoExtractableContent,
  LineCandidate,
} from './voice-draft-rule-based-parser.util';

// The default DraftResolver (see draft-resolver.interface.ts) — regex/
// heuristic extraction (voice-draft-rule-based-parser.util.ts) plus this
// company's own fuzzy-searchable Customer/Product/Service catalog, no
// external dependency and no per-call cost. Bound to DRAFT_RESOLVER in
// invoice-voice-draft.module.ts as of 2026-08-29: an invoicing app
// shouldn't require an LLM subscription just to exist, so this is what
// actually runs today — LlmDraftResolverService (llm/) implements the
// same interface and stays available to bind back in later.
//
// Structurally less capable than an LLM at reading free-form phrasing —
// expect a materially higher needsReview rate here than the LLM engine
// would produce on the same transcript. That's the intended trade-off,
// not a bug to chase away: this engine's whole safety property rests on
// flagging what it isn't sure of rather than guessing, exactly like the
// LLM engine is required to.
@Injectable()
export class RuleBasedDraftResolverService implements DraftResolver {
  constructor(
    private readonly customerService: CustomerService,
    private readonly productService: ProductService,
    private readonly serviceCatalogService: ServiceCatalogService,
    private readonly companyRepository: CompanyRepository,
  ) {}

  // Always true — no config, no external call, nothing to be unavailable
  // for.
  isAvailable(): boolean {
    return true;
  }

  async resolve(companyId: string, transcript: string): Promise<DraftResolverOutcome> {
    if (hasNoExtractableContent(transcript)) {
      return { status: 'rejected', message: REJECTED_MESSAGE };
    }

    const company = await this.companyRepository.findById(companyId);

    const { documentType, confident: documentTypeConfident } = detectDocumentType(transcript);
    const documentTypeNeedsReview: NeedsReview | undefined = documentTypeConfident
      ? undefined
      : { reason: 'no_match' };

    const deposit = detectDeposit(transcript, company.defaultDepositPercentageBasisPoints);
    let depositPercentageBasisPoints: number | undefined;
    let depositNeedsReview: NeedsReview | undefined;
    if (deposit.mentioned) {
      if (deposit.percentageBasisPoints != null) {
        depositPercentageBasisPoints = deposit.percentageBasisPoints;
      } else {
        // "acompte" said but no usable rate (no percentage, "habituel" with
        // no company default) — nothing to compute, flagged rather than
        // guessed. The FACTURE-only conflict itself is re-checked
        // defensively, server-side, once — in
        // InvoiceVoiceDraftService.validateDraft — regardless of which
        // engine produced this field, so it isn't duplicated here.
        depositNeedsReview = { reason: 'no_match' };
      }
    }

    const [customer, { lines, serviceLines }] = await Promise.all([
      this.resolveCustomer(companyId, transcript),
      this.resolveLines(companyId, transcript),
    ]);

    return {
      status: 'resolved',
      draft: {
        documentType,
        documentTypeNeedsReview,
        customer,
        lines,
        serviceLines,
        depositPercentageBasisPoints,
        depositNeedsReview,
        notices: this.detectUnsupportedDetails(transcript),
      },
    };
  }

  private async resolveCustomer(
    companyId: string,
    transcript: string,
  ): Promise<RawVoiceDraftInput['customer']> {
    const candidateText = extractCustomerNameCandidate(transcript);
    if (!candidateText) {
      return { customerName: '', needsReview: { reason: 'no_match' } };
    }

    const matches = await this.customerService.searchFuzzy(companyId, candidateText);
    const { picked, reason, suggestionCandidate } = pickBestMatch(matches);
    if (picked) {
      return {
        customerId: picked.row.id,
        customerName: picked.row.name,
        customerAddress: picked.row.address ?? undefined,
        customerEmail: picked.row.email ?? undefined,
        customerPhone: picked.row.phone ?? undefined,
      };
    }

    return {
      customerName: candidateText,
      needsReview: reason
        ? {
            reason,
            ...(suggestionCandidate
              ? {
                  suggestion: {
                    label: suggestionCandidate.row.name,
                    value: suggestionCandidate.row.id,
                  },
                }
              : {}),
          }
        : undefined,
    };
  }

  private async resolveLines(
    companyId: string,
    transcript: string,
  ): Promise<{
    lines: RawVoiceDraftInput['lines'];
    serviceLines: RawVoiceDraftInput['serviceLines'];
  }> {
    const candidates = extractLineCandidates(transcript);
    const lines: RawVoiceDraftInput['lines'] = [];
    const serviceLines: RawVoiceDraftInput['serviceLines'] = [];

    for (const candidate of candidates) {
      await this.resolveOneLine(companyId, candidate, lines, serviceLines);
    }

    return { lines, serviceLines };
  }

  private async resolveOneLine(
    companyId: string,
    candidate: LineCandidate,
    lines: RawVoiceDraftInput['lines'],
    serviceLines: RawVoiceDraftInput['serviceLines'],
  ): Promise<void> {
    const [productMatches, serviceMatches] = await Promise.all([
      this.productService.searchFuzzy(companyId, candidate.description),
      this.serviceCatalogService.searchFuzzy(companyId, candidate.description),
    ]);
    const productPick = pickBestMatch(productMatches);
    const servicePick = pickBestMatch(serviceMatches);
    const productTopScore = productMatches[0]?.score ?? 0;
    const serviceTopScore = serviceMatches[0]?.score ?? 0;

    // Both catalogs confidently matched the same dictated phrase — prefer
    // whichever scored higher rather than always favoring one catalog.
    const preferProduct =
      productPick.picked && (!servicePick.picked || productTopScore >= serviceTopScore);

    if (preferProduct && productPick.picked) {
      lines.push({
        description: candidate.description,
        unit: productPick.picked.row.unit,
        quantity: candidate.quantity,
        unitPriceCents: productPick.picked.row.priceCents,
        productId: productPick.picked.row.id,
      });
      return;
    }

    if (servicePick.picked) {
      const service = servicePick.picked.row;
      const hasFixedPrice = service.pricingMode === 'FIXED' && service.priceCents != null;
      serviceLines.push({
        name: service.name,
        description: candidate.description,
        // A PERCENTAGE service has no fixed amount this engine can vouch
        // for — same reasoning as LlmDraftResolverService/
        // InvoiceVoiceDraftService.resolveServiceLine's identical rule.
        amountCents: hasFixedPrice ? (service.priceCents as number) : 0,
        serviceId: service.id,
        needsReview: hasFixedPrice ? undefined : { reason: 'no_match' },
      });
      return;
    }

    // Neither catalog confidently matched — falls back to a product-shaped
    // line (it at least carries the dictated unit/quantity), flagged for
    // the artisan to fill in a real price.
    const reason = productPick.reason ?? servicePick.reason ?? 'no_match';
    const suggestionCandidate = productPick.suggestionCandidate ?? servicePick.suggestionCandidate;
    lines.push({
      description: candidate.description,
      unit: candidate.unit,
      quantity: candidate.quantity,
      unitPriceCents: 0,
      needsReview: {
        reason,
        ...(suggestionCandidate
          ? {
              suggestion: {
                label: suggestionCandidate.row.name,
                value: suggestionCandidate.row.id,
              },
            }
          : {}),
      },
    });
  }

  // Known-unsupported dictated details — same role as the LLM engine's
  // `notices[]` (see llm/voice-draft-tools.ts), just keyword-triggered
  // instead of model-judged.
  private detectUnsupportedDetails(transcript: string): RawVoiceDraftInput['notices'] {
    const notices: RawVoiceDraftInput['notices'] = [];
    if (/remise|rabais/i.test(transcript)) {
      notices.push({
        detail: 'remise',
        message:
          "Une remise a peut-être été mentionnée : elle n'est pas prise en charge par la commande vocale, ajoutez-la manuellement dans l'aperçu.",
      });
    }
    if (/\btva\b/i.test(transcript)) {
      notices.push({
        detail: 'tva',
        message:
          "Un taux de TVA particulier a peut-être été mentionné : il n'est pas pris en charge par la commande vocale, vérifiez-le manuellement.",
      });
    }
    return notices;
  }
}
