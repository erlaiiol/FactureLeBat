import { Injectable } from '@nestjs/common';
import { PlanTier, SubscriptionStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../database/prisma.service';
import { higherTier } from './plan-config';

export interface BillingFields {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: SubscriptionStatus;
  // Phase 30: which tier the Stripe subscription above is for (resolved
  // from its price id, see BillingService.applySubscriptionEvent) / which
  // tier a still-valid grant is for — see plan-gate.service.ts's
  // getEffectivePlanTier for how the two combine.
  subscriptionPlanTier: PlanTier | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  premiumGrantedUntil: Date | null;
  grantedPlanTier: PlanTier | null;
  pendingReferralDiscount: boolean;
  trialOfferExpiresAt: Date | null;
}

const BILLING_FIELDS_SELECT = {
  stripeCustomerId: true,
  stripeSubscriptionId: true,
  subscriptionStatus: true,
  subscriptionPlanTier: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
  premiumGrantedUntil: true,
  grantedPlanTier: true,
  pendingReferralDiscount: true,
  trialOfferExpiresAt: true,
} as const;

@Injectable()
export class BillingRepository {
  constructor(private readonly prisma: PrismaService) {}

  getBillingFields(companyId: string): Promise<BillingFields> {
    return this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: BILLING_FIELDS_SELECT,
    });
  }

  // How many invoices this company has ever created — the free-trial gate
  // is "0 invoices so far", not a persisted counter, same "derived data is
  // never persisted" convention as the rest of this app (see
  // docs/roadmap.md's Phase 5/7/8.5 implementation notes). Cheap: an
  // indexed count on Invoice.companyId.
  countInvoices(companyId: string): Promise<number> {
    return this.prisma.invoice.count({ where: { companyId } });
  }

  // Phase 30: catalog-capacity checks (PlanGateService.assertCatalogCapacity)
  // — a "catalog item" is a Product, a Service, or (Phase 32) a Discount,
  // counted together since PLAN_DEFINITIONS caps them as one combined number
  // (see plan-config.ts).
  countCustomers(companyId: string): Promise<number> {
    return this.prisma.customer.count({ where: { companyId } });
  }

  async countCatalogItems(companyId: string): Promise<number> {
    const [productCount, serviceCount, discountCount] = await Promise.all([
      this.prisma.product.count({ where: { companyId } }),
      this.prisma.service.count({ where: { companyId } }),
      this.prisma.discount.count({ where: { companyId } }),
    ]);
    return productCount + serviceCount + discountCount;
  }

  setStripeCustomerId(companyId: string, stripeCustomerId: string): Promise<void> {
    return this.prisma.company
      .update({ where: { id: companyId }, data: { stripeCustomerId } })
      .then(() => undefined);
  }

  findCompanyIdByStripeCustomerId(stripeCustomerId: string): Promise<string | null> {
    return this.prisma.company
      .findUnique({ where: { stripeCustomerId }, select: { id: true } })
      .then((row) => row?.id ?? null);
  }

  // Written exclusively from a verified Stripe webhook event (see
  // BillingService.applySubscriptionEvent) — never from the checkout
  // redirect, which only proves the artisan reached Stripe, not that the
  // subscription actually activated.
  applySubscriptionUpdate(
    companyId: string,
    data: {
      stripeSubscriptionId: string;
      subscriptionStatus: SubscriptionStatus;
      // Phase 30: null when the subscription's price id doesn't match any
      // configured tier — see BillingService.applySubscriptionEvent. Never
      // silently guessed at a tier in that case.
      subscriptionPlanTier: PlanTier | null;
      currentPeriodEnd: Date | null;
      cancelAtPeriodEnd: boolean;
    },
  ): Promise<void> {
    // A confirmed subscription event means any pending referral-discount
    // coupon (see setPendingReferralDiscount) either just got attached to
    // the Checkout Session that produced this subscription, or was never
    // relevant to begin with — either way there is nothing left "pending"
    // once a real subscription exists. Harmless no-op when already false.
    return this.prisma.company
      .update({ where: { id: companyId }, data: { ...data, pendingReferralDiscount: false } })
      .then(() => undefined);
  }

  // Phase 29: set when a filleul's Stripe discount coupon couldn't be
  // applied immediately (no live subscription to apply it to yet — the
  // normal case for a brand-new filleul) — see
  // BillingService.grantReferralDiscount/createCheckoutSession. Cleared
  // once BillingService.applySubscriptionEvent confirms a real subscription
  // exists, whether or not it started via a discounted checkout.
  setPendingReferralDiscount(companyId: string, pending: boolean): Promise<void> {
    return this.prisma.company
      .update({ where: { id: companyId }, data: { pendingReferralDiscount: pending } })
      .then(() => undefined);
  }

  // Phase 30 (generalizes Phase 14's grantPremiumDays): extends the date
  // from whichever is later — the current grant (if still running) or now —
  // so redeeming a second code/grant while one is already active stacks on
  // top of it instead of resetting the clock backward. The tier follows the
  // same non-regression rule via higherTier: stacking a lower-tier grant on
  // top of a still-running higher-tier one never downgrades it, it only
  // extends the date.
  async grantPlanDays(
    companyId: string,
    tier: PlanTier,
    days: number,
  ): Promise<{ until: Date; tier: PlanTier }> {
    const { premiumGrantedUntil, grantedPlanTier } = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { premiumGrantedUntil: true, grantedPlanTier: true },
    });
    const now = new Date();
    const currentlyValid = premiumGrantedUntil !== null && premiumGrantedUntil > now;
    const base = currentlyValid ? premiumGrantedUntil : now;
    const effectiveTier = (currentlyValid ? higherTier(grantedPlanTier, tier) : tier) ?? tier;
    const newUntil = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    await this.prisma.company.update({
      where: { id: companyId },
      data: { premiumGrantedUntil: newUntil, grantedPlanTier: effectiveTier },
    });
    return { until: newUntil, tier: effectiveTier };
  }

  // Phase 33: starts the "1er mois à 2€" countdown — a conditional update
  // (`where: trialOfferExpiresAt: null`) rather than a plain set, so this is
  // safe to call more than once for the same company (PlanGateService.
  // recordInvoiceCreated already guards on invoiceCount === 1, but two
  // concurrent requests racing that check would otherwise both "win" and
  // each compute their own expiry). The loser of the race simply updates
  // zero rows.
  async startTrialOfferWindow(companyId: string, windowHours: number): Promise<void> {
    const expiresAt = new Date(Date.now() + windowHours * 60 * 60 * 1000);
    await this.prisma.company.updateMany({
      where: { id: companyId, trialOfferExpiresAt: null },
      data: { trialOfferExpiresAt: expiresAt },
    });
  }
}
