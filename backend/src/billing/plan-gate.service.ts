import { Injectable } from '@nestjs/common';
import { PlanTier, SubscriptionStatus } from '../../generated/prisma/enums';
import { BillingFields, BillingRepository } from './billing.repository';
import { CatalogLimitExceededException } from './catalog-limit-exceeded.exception';
import { CatalogKind, GatedFeature, PLAN_DEFINITIONS, higherTier } from './plan-config';
import { PlanFeatureLockedException } from './plan-feature-locked.exception';
import { PremiumRequiredException } from './premium-required.exception';

// Phase 14's original business rule, generalized by Phase 30 from a single
// boolean ("premium or not") to 3 tiers — isolated from both the Stripe
// plumbing (StripeClientService) and the HTTP surface (BillingController):
// - a company may always configure its environment (customers/products/
//   services) up to its tier's cap, and may always create its very first
//   invoice for free, with NO cap at all on invoices/devis themselves — see
//   docs/roadmap.md Phase 30's "no limit on devis/factures, at any tier".
// - every invoice after the first requires an active subscription or a live
//   grant of ANY tier (Stripe or promo-code/admin/referral-issued — all
//   interchangeable here, see BillingRepository.grantPlanDays).
// - two features (Phase 17 analytics, Phase 10 AI assistant) require a
//   tier whose PLAN_DEFINITIONS entry actually includes them.
@Injectable()
export class PlanGateService {
  constructor(private readonly repository: BillingRepository) {}

  // Deliberately called from InvoiceService.create()/previewPdf() (both),
  // and nowhere earlier in the flow — see docs/roadmap.md Phase 14's
  // "frustrate at the last moment" instruction, unchanged by Phase 30.
  async assertCanCreateInvoice(companyId: string): Promise<void> {
    const [fields, invoiceCount] = await Promise.all([
      this.repository.getBillingFields(companyId),
      this.repository.countInvoices(companyId),
    ]);

    if (invoiceCount < 1) {
      return; // free trial invoice — always allowed regardless of subscription
    }
    if (getEffectivePlanTier(fields)) {
      return;
    }
    throw new PremiumRequiredException();
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
