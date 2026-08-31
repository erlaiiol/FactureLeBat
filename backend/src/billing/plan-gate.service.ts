import { Injectable } from '@nestjs/common';
import { InvoiceEntryMode, PlanTier, SubscriptionStatus } from '../../generated/prisma/enums';
import { BillingFields, BillingRepository } from './billing.repository';
import { CatalogLimitExceededException } from './catalog-limit-exceeded.exception';
import {
  CatalogKind,
  GatedFeature,
  PLAN_DEFINITIONS,
  TRIAL_OFFER_WINDOW_HOURS,
  higherTier,
} from './plan-config';
import { PlanFeatureLockedException } from './plan-feature-locked.exception';
import { PremiumRequiredException } from './premium-required.exception';

// Phase 14's original business rule, generalized by Phase 30 from a single
// boolean ("premium or not") to 3 tiers, then revised again (1.2, "manual
// mode free tier") from one flat rule into a per-channel one — isolated from
// both the Stripe plumbing (StripeClientService) and the HTTP surface
// (BillingController):
// - a company may always configure its environment (customers/products/
//   services) up to its tier's cap, with NO cap at all on invoices/devis
//   themselves — see docs/roadmap.md Phase 30's "no limit on devis/
//   factures, at any tier" (still true: nothing here ever caps a *count* of
//   documents, only which channel produced them).
// - MANUAL (the free-form canvas) stays free and unlimited on every tier,
//   forever — the "almost always available" promise the manual mode is
//   meant to keep even for an artisan who never subscribes.
// - GUIDED (mode rapide) carries exactly one lifetime free invoice, counted
//   over GUIDED invoices only (see BillingRepository.countInvoices) so an
//   artisan's MANUAL usage never consumes or blocks it. Every GUIDED
//   invoice after that one requires an active subscription or a live grant
//   of ANY tier (Stripe or promo-code/admin/referral-issued — all
//   interchangeable here, see BillingRepository.grantPlanDays).
// - QUICK_ACTION (the invoice board's "Facture à partir du devis"/"Créer un
//   devis" one-click shortcuts, InvoiceService.convertToFacture/
//   convertToDevis) and voice-originated invoices carry no free credit at
//   all — voice is additionally kept out of reach entirely for a free
//   company by the frontend's premiumRequiredGuard on the `vocal` route, so
//   it never even reaches this check, but QUICK_ACTION has no route to gate
//   (it's a menu action within the invoice board), so it's enforced here.
// - two features (Phase 17 analytics, Phase 10 AI assistant) require a
//   tier whose PLAN_DEFINITIONS entry actually includes them.
export type InvoiceCreationChannel = 'MANUAL' | 'GUIDED' | 'QUICK_ACTION';

@Injectable()
export class PlanGateService {
  constructor(private readonly repository: BillingRepository) {}

  // Deliberately called from InvoiceService.create()/previewPdf() (both),
  // and nowhere earlier in the flow for MANUAL/GUIDED — see
  // docs/roadmap.md Phase 14's "frustrate at the last moment" instruction.
  // QUICK_ACTION is the one exception: its two callers are locked
  // preventively behind a lock icon in the invoice board UI before this is
  // ever reached, since there's no multi-step flow there to frustrate at
  // the end of — see InvoiceListRowComponent's premiumRequired input.
  async assertCanCreateInvoice(companyId: string, channel: InvoiceCreationChannel): Promise<void> {
    if (channel === 'MANUAL') {
      return; // free and unlimited on every tier, see the header comment above
    }

    const fields = await this.repository.getBillingFields(companyId);
    if (getEffectivePlanTier(fields)) {
      return;
    }

    if (channel === 'GUIDED') {
      const guidedInvoiceCount = await this.repository.countInvoices(
        companyId,
        InvoiceEntryMode.GUIDED,
      );
      if (guidedInvoiceCount < 1) {
        return; // free trial invoice — always allowed regardless of subscription
      }
    }
    throw new PremiumRequiredException();
  }

  // Phase 33: called right after InvoiceService.create()/convertToFacture()
  // actually persists an invoice — never from assertCanCreateInvoice itself,
  // which also runs on previewPdf/previewData where nothing is saved, and
  // would otherwise start the clock on a preview that's never submitted.
  // Starts the "1er mois à 2€" countdown exactly once, only for a company
  // that just created its very first invoice ever (the free-trial one) and
  // has no plan already — a paying company hitting invoiceCount === 1 right
  // after subscribing gets no offer, it has nothing left to convert.
  // Idempotent by construction (BillingRepository.startTrialOfferWindow is a
  // conditional update), so a second, unrelated call here is harmless.
  async recordInvoiceCreated(companyId: string): Promise<void> {
    const [fields, invoiceCount] = await Promise.all([
      this.repository.getBillingFields(companyId),
      this.repository.countInvoices(companyId),
    ]);
    if (invoiceCount !== 1 || getEffectivePlanTier(fields)) {
      return;
    }
    await this.repository.startTrialOfferWindow(companyId, TRIAL_OFFER_WINDOW_HOURS);
  }

  async getEffectivePlanTier(companyId: string): Promise<PlanTier | null> {
    return getEffectivePlanTier(await this.repository.getBillingFields(companyId));
  }

  async hasPremiumAccess(companyId: string): Promise<boolean> {
    return (await this.getEffectivePlanTier(companyId)) !== null;
  }

  // A company with no active plan at all (still inside the Phase 14 free
  // trial, never subscribed) is treated as Essentiel for this check — see
  // docs/roadmap.md Phase 30: there was no tier to fall back on before this
  // phase, and Essentiel's caps were already sized to be non-intrusive for
  // a brand-new company.
  async assertCatalogCapacity(companyId: string, kind: CatalogKind): Promise<void> {
    const fields = await this.repository.getBillingFields(companyId);
    const tier = getEffectivePlanTier(fields) ?? PlanTier.ESSENTIEL;
    const definition = PLAN_DEFINITIONS[tier];
    const limit = kind === 'customer' ? definition.customerLimit : definition.catalogItemLimit;
    if (limit === null) {
      return; // Premium: unlimited
    }

    const currentCount =
      kind === 'customer'
        ? await this.repository.countCustomers(companyId)
        : await this.repository.countCatalogItems(companyId);

    if (currentCount < limit) {
      return;
    }
    throw new CatalogLimitExceededException(kind, limit, currentCount, definition.name);
  }

  // Unlike assertCanCreateInvoice, a company with no active plan has no
  // access at all here — analytics/AI assistant were never part of the
  // Phase 14 free-trial promise (only the one free invoice was), see
  // docs/roadmap.md Phase 30.
  async assertFeatureAccess(companyId: string, feature: GatedFeature): Promise<void> {
    const fields = await this.repository.getBillingFields(companyId);
    const tier = getEffectivePlanTier(fields);
    if (tier && PLAN_DEFINITIONS[tier].features[feature]) {
      return;
    }
    throw new PlanFeatureLockedException(feature);
  }
}

type EffectiveTierFields = Pick<
  BillingFields,
  'subscriptionStatus' | 'subscriptionPlanTier' | 'premiumGrantedUntil' | 'grantedPlanTier'
>;

// The higher of an active Stripe subscription's tier and a still-valid
// grant's tier — an artisan can be a paying Pro subscriber *and* have a
// Premium referral grant layered on top, and must get the better of the
// two, never lose it to whichever happens to be checked first. Narrowed to
// just the fields it reads (not the full BillingFields shape) so
// AdminService can reuse it directly off its own User/Company join row
// without assembling a fake full BillingFields object.
export function getEffectivePlanTier(fields: EffectiveTierFields): PlanTier | null {
  const stripeTier =
    fields.subscriptionStatus === SubscriptionStatus.ACTIVE ? fields.subscriptionPlanTier : null;
  const grantTier =
    fields.premiumGrantedUntil && fields.premiumGrantedUntil > new Date()
      ? fields.grantedPlanTier
      : null;
  return higherTier(stripeTier, grantTier);
}

// Kept for admin.service.ts/billing.service.ts's boolean-only call sites —
// "has any active plan at all", generalizing Phase 14's single-tier boolean
// the same way getEffectivePlanTier generalizes the tier itself.
export function hasPremiumAccess(fields: EffectiveTierFields): boolean {
  return getEffectivePlanTier(fields) !== null;
}

// Phase 33: true while the per-company "1er mois à 2€" countdown
// (Company.trialOfferExpiresAt, started once by recordInvoiceCreated above)
// is still running AND the company hasn't already converted — a company
// that subscribes or gets a grant mid-countdown stops seeing the offer even
// though the timestamp itself is never cleared (see the schema comment on
// trialOfferExpiresAt for why it's left in place).
export function isTrialOfferActive(
  fields: EffectiveTierFields & { trialOfferExpiresAt: Date | null },
): boolean {
  return (
    fields.trialOfferExpiresAt !== null &&
    fields.trialOfferExpiresAt > new Date() &&
    !hasPremiumAccess(fields)
  );
}
