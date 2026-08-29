import { Inject, Injectable, Logger } from '@nestjs/common';
import { CustomerService } from '../customer/customer.service';
import { ProductService } from '../product/product.service';
import { ServiceCatalogService } from '../service-catalog/service-catalog.service';
import { DRAFT_RESOLVER, RawVoiceDraftInput } from './draft-resolver.interface';
import type { DraftResolver } from './draft-resolver.interface';
import { VoiceDraftRequestDto } from './dto/voice-draft-request.dto';
import {
  NeedsReview,
  VoiceDraftCustomer,
  VoiceDraftLine,
  VoiceDraftResult,
  VoiceDraftServiceLine,
  VoiceInvoiceDraft,
} from './entities/voice-invoice-draft.entity';

// Any resolvable-by-id reference (customer/product/service) — the shape
// every re-validation lookup below needs, nothing more.
interface Identifiable {
  id: string;
}

// Orchestration only: hands the transcript to whichever DraftResolver is
// bound (DRAFT_RESOLVER — see draft-resolver.interface.ts; the rule-based
// engine today, an LLM tool loop when re-enabled) and never knows which.
// This class's own job is the one thing every engine equally needs and
// neither should have to duplicate: re-validating every id an engine
// claims against this company's own data before any of it is trusted (see
// validateDraft below) — this feature writes structured fields onto what
// will become a legal document, not free-text search results, so an
// engine's own output is never trusted as-is, rule-based or LLM alike.
@Injectable()
export class InvoiceVoiceDraftService {
  private readonly logger = new Logger(InvoiceVoiceDraftService.name);

  constructor(
    @Inject(DRAFT_RESOLVER) private readonly draftResolver: DraftResolver,
    private readonly customerService: CustomerService,
    private readonly productService: ProductService,
    private readonly serviceCatalogService: ServiceCatalogService,
  ) {}

  async resolveDraft(companyId: string, dto: VoiceDraftRequestDto): Promise<VoiceDraftResult> {
    const outcome = await this.draftResolver.resolve(companyId, dto.transcript);
    if (outcome.status === 'rejected') {
      return outcome;
    }
    const draft = await this.validateDraft(companyId, outcome.draft);
    return { status: 'resolved', draft };
  }

  // The security-critical pass: every id an engine claims (the primary
  // resolved reference AND any needsReview.suggestion) is re-checked to
  // actually belong to this company, and every price/unit on a matched
  // line is overwritten from what that lookup actually returned — never
  // trusted from the engine's own echoed values. A mismatch degrades the
  // field to unset + needsReview rather than throwing: a forged or stale
  // id is structurally the same failure mode as a bad database read, not
  // a reason to fail the whole request.
  private async validateDraft(
    companyId: string,
    raw: RawVoiceDraftInput,
  ): Promise<VoiceInvoiceDraft> {
    const [customer, lines, serviceLines] = await Promise.all([
      this.resolveCustomer(companyId, raw.customer),
      Promise.all(raw.lines.map((line) => this.resolveLine(companyId, line))),
      Promise.all(
        raw.serviceLines.map((serviceLine) => this.resolveServiceLine(companyId, serviceLine)),
      ),
    ]);

    let depositNeedsReview = raw.depositNeedsReview;
    if (raw.depositPercentageBasisPoints != null && raw.documentType === 'DEVIS') {
      // Defensive re-check, independent of whether the resolving engine
      // already flagged this itself — see docs/1.4/1.4-1's transcript #5:
      // an acompte only ever applies to a FACTURE.
      depositNeedsReview = { reason: 'document_type_conflict' };
    }

    return {
      documentType: raw.documentType,
      documentTypeNeedsReview: raw.documentTypeNeedsReview,
      customer,
      lines,
      serviceLines,
      depositPercentageBasisPoints: raw.depositPercentageBasisPoints,
      depositNeedsReview,
      notices: raw.notices,
    };
  }

  private async resolveCustomer(
    companyId: string,
    raw: RawVoiceDraftInput['customer'],
  ): Promise<VoiceDraftCustomer> {
    let customerId: string | undefined;
    let needsReview = raw.needsReview;

    if (raw.customerId) {
      const found = await this.customerService.findByIdOrNull(companyId, raw.customerId);
      if (found) {
        customerId = found.id;
      } else {
        this.logger.warn('Voice draft: engine referenced a customerId not owned by this company');
        needsReview = { reason: 'no_match' };
      }
    }

    return {
      customerId,
      customerName: raw.customerName,
      customerAddress: raw.customerAddress,
      customerEmail: raw.customerEmail,
      customerPhone: raw.customerPhone,
      needsReview: await this.revalidateSuggestion(needsReview, (id) =>
        this.customerService.findByIdOrNull(companyId, id),
      ),
    };
  }

  private async resolveLine(
    companyId: string,
    raw: RawVoiceDraftInput['lines'][number],
  ): Promise<VoiceDraftLine> {
    let productId: string | undefined;
    let unit = raw.unit;
    let unitPriceCents = raw.unitPriceCents;
    let needsReview = raw.needsReview;

    if (raw.productId) {
      const found = await this.productService.findByIdOrNull(companyId, raw.productId);
      if (found) {
        productId = found.id;
        unit = found.unit;
        unitPriceCents = found.priceCents;
      } else {
        this.logger.warn('Voice draft: engine referenced a productId not owned by this company');
        needsReview = { reason: 'no_match' };
      }
    }

    // A line with no matched product has no price this service can vouch
    // for — never let it through silently even if the resolving engine
    // forgot to flag it itself (see docs/1.4/1.4-1's "never silently
    // wrong" rule).
    if (!productId && !needsReview) {
      needsReview = { reason: 'no_match' };
    }

    return {
      description: raw.description,
      unit,
      quantity: raw.quantity,
      unitPriceCents,
      productId,
      needsReview: await this.revalidateSuggestion(needsReview, (id) =>
        this.productService.findByIdOrNull(companyId, id),
      ),
    };
  }

  private async resolveServiceLine(
    companyId: string,
    raw: RawVoiceDraftInput['serviceLines'][number],
  ): Promise<VoiceDraftServiceLine> {
    let serviceId: string | undefined;
    let amountCents = raw.amountCents;
    let needsReview = raw.needsReview;

    if (raw.serviceId) {
      const found = await this.serviceCatalogService.findByIdOrNull(companyId, raw.serviceId);
      if (found) {
        serviceId = found.id;
        if (found.pricingMode === 'FIXED' && found.priceCents != null) {
          // Only a FIXED-price service has a ground truth this service can
          // vouch for — a PERCENTAGE service's real amount depends on the
          // invoice's own base, resolved elsewhere in the normal creation
          // path, not something this endpoint can compute or trust from
          // the resolving engine.
          amountCents = found.priceCents;
        } else {
          needsReview = { reason: 'no_match' };
        }
      } else {
        this.logger.warn('Voice draft: engine referenced a serviceId not owned by this company');
        needsReview = { reason: 'no_match' };
      }
    }

    if (!serviceId && !needsReview) {
      needsReview = { reason: 'no_match' };
    }

    return {
      serviceId,
      name: raw.name,
      description: raw.description,
      amountCents,
      needsReview: await this.revalidateSuggestion(needsReview, (id) =>
        this.serviceCatalogService.findByIdOrNull(companyId, id),
      ),
    };
  }

  // A needsReview.suggestion carries an id the artisan can one-tap-apply
  // in the review screen (1.4-2) — re-checked here the same way a primary
  // reference is, so a forged/stale suggestion id can never reach the
  // frontend either. Drops just the suggestion (keeps the reason) rather
  // than the whole flag when it fails.
  private async revalidateSuggestion<T extends Identifiable>(
    needsReview: NeedsReview | undefined,
    lookup: (id: string) => Promise<T | null>,
  ): Promise<NeedsReview | undefined> {
    if (!needsReview?.suggestion) {
      return needsReview;
    }
    const found = await lookup(needsReview.suggestion.value);
    if (found) {
      return needsReview;
    }
    this.logger.warn('Voice draft: engine suggested an id not owned by this company');
    return { reason: needsReview.reason };
  }
}
