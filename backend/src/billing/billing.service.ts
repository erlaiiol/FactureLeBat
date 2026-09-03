import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { InvoiceEntryMode, PlanTier, SubscriptionStatus } from '../../generated/prisma/enums';
import { AlreadySubscribedError } from './already-subscribed.error';
import { BillingRepository } from './billing.repository';
import { BillingStatus, TrialOffer } from './entities/billing-status.entity';
import { PlanCatalog } from './entities/plan-catalog.entity';
import { NoBillingCustomerError } from './no-billing-customer.error';
import {
  FACTURX_FREE_MONTHLY_LIMIT,
  PLAN_DEFINITIONS,
  PLAN_TIER_ORDER,
  TRIAL_OFFER_PRICE_EUROS,
  TRIAL_OFFER_TIER,
} from './plan-config';
import { getEffectivePlanTier, isTrialOfferActive } from './plan-gate.service';
import { REFERRAL_DISCOUNT_PERCENT_OFF, StripeClientService } from './stripe/stripe-client.service';
import { mapStripeSubscriptionStatus } from './stripe/subscription-status.util';

// Same idempotency key for every checkout-session request from a given
// company within this window, so a double-click, an impatient reload+retry,
// or two tabs open at once all collapse onto the single Stripe Checkout
// Session Stripe creates for the first one of them — the artisan can never
// complete two of them and end up with two subscriptions. Wide enough to
// absorb a slow reload, short enough that a genuinely later, deliberate
// subscribe attempt (e.g. after actually canceling first) still gets its
// own session. Keyed by tier too — switching tiers mid-window still starts
// a fresh session rather than replaying a stale one for the wrong price.
const CHECKOUT_IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;

function buildCheckoutIdempotencyKey(companyId: string, tier: PlanTier): string {
  const windowIndex = Math.floor(Date.now() / CHECKOUT_IDEMPOTENCY_WINDOW_MS);
  return `checkout:${companyId}:${tier}:${windowIndex}`;
}

// Orchestration only, same split as InvoiceService: StripeClientService owns
// the raw SDK calls, BillingRepository owns the Company row, this class
// wires the two together and is what BillingController talks to.
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly frontendUrl: string;

  constructor(
    private readonly repository: BillingRepository,
    private readonly stripeClient: StripeClientService,
    config: ConfigService,
  ) {
    this.frontendUrl = config.get<string>('FRONTEND_URL', 'http://localhost:4200');
  }

  async getStatus(companyId: string): Promise<BillingStatus> {
    const [fields, guidedInvoiceCount, customerCount, catalogItemCount, facturXUsedThisMonth] =
      await Promise.all([
        this.repository.getBillingFields(companyId),
        // 1.2/manual-mode-free-tier revision: only mode rapide's own free
        // credit, not every invoice — MANUAL is unrestricted and never
        // consumes it, see PlanGateService.assertCanCreateInvoice.
        this.repository.countInvoices(companyId, InvoiceEntryMode.GUIDED),
        this.repository.countCustomers(companyId),
        this.repository.countCatalogItems(companyId),
        // 1.2/facturx-monthly-quota revision — see PlanGateService.canUseFacturX.
        this.repository.countFacturXUsedThisMonth(companyId),
      ]);
    const planTier = getEffectivePlanTier(fields);
    const capsTier = planTier ?? PlanTier.ESSENTIEL;
    const trialOffer: TrialOffer | null = isTrialOfferActive(fields)
      ? {
          tier: TRIAL_OFFER_TIER,
          expiresAt: fields.trialOfferExpiresAt!,
          discountedPriceEuros: TRIAL_OFFER_PRICE_EUROS,
          normalPriceEuros: PLAN_DEFINITIONS[TRIAL_OFFER_TIER].priceEuros,
        }
      : null;
    return {
      subscriptionStatus: fields.subscriptionStatus,
      hasPremiumAccess: planTier !== null,
      planTier,
      currentPeriodEnd: fields.currentPeriodEnd,
      cancelAtPeriodEnd: fields.cancelAtPeriodEnd,
      premiumGrantedUntil: fields.premiumGrantedUntil,
      grantedPlanTier: fields.grantedPlanTier,
      freeInvoiceUsed: guidedInvoiceCount >= 1,
      stripeConfigured: this.stripeClient.isConfigured(),
      customerCount,
      customerLimit: PLAN_DEFINITIONS[capsTier].customerLimit,
      catalogItemCount,
      catalogItemLimit: PLAN_DEFINITIONS[capsTier].catalogItemLimit,
      facturXUsedThisMonth,
      facturXFreeLimit: planTier === null ? FACTURX_FREE_MONTHLY_LIMIT : null,
      trialOffer,
    };
  }

  // Phase 30: the 3 tier definitions the frontend pricing UI renders,
  // enriched with which ones are actually purchasable here (Stripe price
  // configured) and today's launch-offer state — see plan-config.ts and
  // StripeClientService.
  getPlanCatalog(): PlanCatalog {
    const availableTiers = new Set(this.stripeClient.availableTiers());
    const plans = PLAN_TIER_ORDER.map((tier) => {
      const definition = PLAN_DEFINITIONS[tier];
      return {
        tier,
        name: definition.name,
        priceEuros: definition.priceEuros,
        tagline: definition.tagline,
        customerLimit: definition.customerLimit,
        catalogItemLimit: definition.catalogItemLimit,
        features: definition.features,
        prioritySupport: definition.prioritySupport,
        highlight: definition.highlight,
        removesWatermark: definition.removesWatermark,
        available: availableTiers.has(tier),
      };
    });

    const offer = this.stripeClient.launchOfferInfo();
    const launchOffer = offer.expiresAt
      ? {
          tier: PlanTier.PREMIUM,
          active: offer.active,
          expiresAt: offer.expiresAt,
          discountedPriceEuros:
            PLAN_DEFINITIONS[PlanTier.PREMIUM].priceEuros - offer.amountOffCents / 100,
          durationMonths: offer.durationMonths,
        }
      : null;

    return { plans, launchOffer, referralFilleulDiscountPercent: REFERRAL_DISCOUNT_PERCENT_OFF };
  }

  // Reuses an existing Stripe Customer if this company already has one
  // (e.g. a lapsed/canceled subscriber resubscribing) rather than creating
  // a duplicate — Stripe has no natural dedupe key for this, so
  // stripeCustomerId is the one this app owns and persists on first use.
  async createCheckoutSession(
    companyId: string,
    email: string,
    tier: PlanTier,
  ): Promise<{ url: string }> {
    const fields = await this.repository.getBillingFields(companyId);

    // A subscription already exists on this customer (paying fine, or
    // paying but currently failing) — starting a second Checkout Session
    // would risk a second, parallel Stripe subscription and a real double
    // charge, not just a UI inconsistency. PAST_DUE is fixed through the
    // billing portal (update payment method on the existing subscription,
    // or a tier change through the same portal), never by subscribing
    // again.
    if (
      fields.subscriptionStatus === SubscriptionStatus.ACTIVE ||
      fields.subscriptionStatus === SubscriptionStatus.PAST_DUE
    ) {
      throw new AlreadySubscribedError();
    }

    let customerId = fields.stripeCustomerId;
    if (!customerId) {
      const customer = await this.stripeClient.createCustomer(email, companyId);
      customerId = customer.id;
      await this.repository.setStripeCustomerId(companyId, customerId);
    }

    // Phase 30 explicitly decided a referral discount always outranks the
    // generic, calendar-wide launch offer, regardless of the exact numbers
    // ("a specific, earned reward outranks a generic sitewide promotion") —
    // that decision stands untouched here, on purpose: it's not a
    // price-comparison problem, it's a value judgment already made with the
    // user.
    //
    // Phase 33 adds a second specific/earned reward (the personal
    // trial-offer countdown) that can now be active *at the same time* as
    // the referral discount — a referred filleul who also just created
    // their free-trial invoice has both pendingReferralDiscount AND
    // isTrialOfferActive at once. There is no prior ordering decision
    // between these two, and picking one arbitrarily is actively harmful:
    // referral's -30% is 10,50 € on Premium, the trial offer is a flat 2 €
    // — an arbitrary "referral always wins" would leave a referred filleul
    // paying more than a stranger gets in the same trial-offer window,
    // which defeats the point of being referred by a friend. So between
    // these two specifically, whichever is actually cheaper for the
    // artisan wins; the launch offer stays the fallback, only reached when
    // neither of the two specific rewards applies.
    const referralActive = fields.pendingReferralDiscount;
    const trialActive = tier === TRIAL_OFFER_TIER && isTrialOfferActive(fields);

    let discountKind: 'referral' | 'trial' | 'launch' | null = null;
    if (referralActive && trialActive) {
      const normalPriceEuros = PLAN_DEFINITIONS[tier].priceEuros;
      const referralPriceEuros = normalPriceEuros * (1 - REFERRAL_DISCOUNT_PERCENT_OFF / 100);
      discountKind = TRIAL_OFFER_PRICE_EUROS <= referralPriceEuros ? 'trial' : 'referral';
    } else if (referralActive) {
      discountKind = 'referral';
    } else if (trialActive) {
      discountKind = 'trial';
    } else if (tier === PlanTier.PREMIUM && this.stripeClient.isLaunchOfferActive()) {
      discountKind = 'launch';
    }

    let discountCouponId: string | undefined;
    if (discountKind === 'referral') {
      discountCouponId = await this.stripeClient.ensureReferralDiscountCoupon();
    } else if (discountKind === 'trial') {
      discountCouponId = await this.stripeClient.ensureTrialOfferCoupon();
    } else if (discountKind === 'launch') {
      discountCouponId = await this.stripeClient.ensureLaunchOfferCoupon();
    }

    const session = await this.stripeClient.createCheckoutSession({
      tier,
      customerId,
      companyId,
      successUrl: `${this.frontendUrl}/abonnement?success=1`,
      cancelUrl: `${this.frontendUrl}/abonnement?canceled=1`,
      idempotencyKey: buildCheckoutIdempotencyKey(companyId, tier),
      discountCouponId,
    });

    if (!session.url) {
      throw new Error('Stripe did not return a Checkout Session URL');
    }
    return { url: session.url };
  }

  // Lets a subscribed artisan manage/cancel their subscription (and, via
  // Stripe's own portal configuration, switch tiers) through Stripe's own
  // hosted portal instead of this app reimplementing that UI — requires an
  // existing customer (a company that has never started a checkout has
  // nothing to manage yet).
  async createPortalSession(companyId: string): Promise<{ url: string }> {
    const fields = await this.repository.getBillingFields(companyId);
    if (!fields.stripeCustomerId) {
      throw new NoBillingCustomerError();
    }
    const session = await this.stripeClient.createPortalSession(
      fields.stripeCustomerId,
      `${this.frontendUrl}/abonnement`,
    );
    return { url: session.url };
  }

  isStripeConfigured(): boolean {
    return this.stripeClient.isConfigured();
  }

  // Phase 29/30: the filleul side of the referral reward — -30% off their
  // first billing cycle, whichever tier they choose. A no-op deployment
  // with no Stripe configured has no subscription price to discount in the
  // first place, same "optional feature, boots fine without it" posture as
  // the rest of billing/. Called from ReferralService.
  // grantRewardForVerifiedEmail, which already guarantees this fires at
  // most once per company (Referral.referredCompanyId is @@unique).
  async grantReferralDiscount(companyId: string): Promise<void> {
    if (!this.stripeClient.isConfigured()) {
      return;
    }
    const fields = await this.repository.getBillingFields(companyId);
    const hasLiveSubscription =
      fields.stripeSubscriptionId !== null &&
      (fields.subscriptionStatus === SubscriptionStatus.ACTIVE ||
        fields.subscriptionStatus === SubscriptionStatus.PAST_DUE);

    if (hasLiveSubscription) {
      const couponId = await this.stripeClient.ensureReferralDiscountCoupon();
      await this.stripeClient.applyCouponToSubscription(fields.stripeSubscriptionId!, couponId);
      return;
    }
    // The normal case: a brand-new filleul has no subscription yet — flag
    // it so the next Checkout Session they create picks up the discount
    // (see createCheckoutSession above).
    await this.repository.setPendingReferralDiscount(companyId, true);
  }

  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const event = this.stripeClient.constructWebhookEvent(rawBody, signature);

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.applySubscriptionEvent(event.data.object);
        break;
      default:
        // Every other event type is either irrelevant to this app's own
        // state (e.g. invoice.paid, payment_method.attached) or already
        // implied by the subscription events above — ignored rather than
        // erroring, since Stripe retries a non-2xx response and there is
        // nothing here to retry.
        this.logger.debug(`Ignoring unhandled Stripe event type: ${event.type}`);
    }
  }

  private async applySubscriptionEvent(subscription: Stripe.Subscription): Promise<void> {
    const customerId =
      typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
    const companyId =
      subscription.metadata?.companyId ??
      (await this.repository.findCompanyIdByStripeCustomerId(customerId));

    if (!companyId) {
      this.logger.warn(
        `Stripe subscription event for unknown company (customer ${customerId}, subscription ${subscription.id})`,
      );
      return;
    }

    const item = subscription.items.data[0];
    const currentPeriodEndUnix = item?.current_period_end;
    const priceId = typeof item?.price === 'string' ? item.price : item?.price?.id;
    const subscriptionPlanTier = this.stripeClient.resolveTierFromPriceId(priceId);
    if (!subscriptionPlanTier) {
      this.logger.warn(
        `Stripe subscription ${subscription.id} price id ${priceId ?? '(none)'} does not match any configured tier — subscriptionPlanTier left unresolved.`,
      );
    }
    await this.repository.applySubscriptionUpdate(companyId, {
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: mapStripeSubscriptionStatus(subscription.status),
      subscriptionPlanTier,
      currentPeriodEnd: currentPeriodEndUnix ? new Date(currentPeriodEndUnix * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    });
  }
}
