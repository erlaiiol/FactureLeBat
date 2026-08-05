import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PlanTier } from '../../../generated/prisma/enums';
import {
  PLAN_DEFINITIONS,
  PLAN_TIER_ORDER,
  TRIAL_OFFER_PRICE_EUROS,
  TRIAL_OFFER_TIER,
} from '../plan-config';
import { StripeUnavailableError } from './stripe-unavailable.error';

// Phase 30: the filleul's referral reward — -30% on their first billing
// cycle, whichever of the 3 tiers they choose. Was a flat 5€ off (Phase 29)
// when there was only one possible price to discount; a percentage is what
// keeps the reward proportionate now that Essentiel/Pro/Premium all exist —
// see docs/roadmap.md Phase 30. New coupon id (the old fixed-amount one is
// left orphaned in Stripe, harmless, `duration: 'once'` means it only ever
// affected an invoice at the time it was applied).
const REFERRAL_DISCOUNT_COUPON_ID = 'referral-filleul-30pct-1mois';
export const REFERRAL_DISCOUNT_PERCENT_OFF = 30;

// Phase 30: time-boxed "offre de lancement" on Premium only — 15€ → 10€ for
// the first 2 months of a Premium subscription, active only while
// LAUNCH_OFFER_EXPIRES_AT is set and in the future. See docs/roadmap.md
// Phase 30 for why this is Premium-only and calendar-boxed rather than a
// sitewide or redemption-counted promotion.
const LAUNCH_OFFER_COUPON_ID = 'launch-offer-premium-2mois';
const LAUNCH_OFFER_AMOUNT_OFF_CENTS = 500;
const LAUNCH_OFFER_DURATION_MONTHS = 2;

// Phase 33: the per-company "1er mois à 2€" trial-conversion offer — see
// plan-config.ts's TRIAL_OFFER_* constants and PlanGateService.
// isTrialOfferActive for when it's live. `duration: 'once'` (unlike the
// launch offer's `repeating`): this is a door-opener for the first invoice
// after the free trial, not a multi-month discount — from the 2nd billing
// cycle onward the artisan pays Premium's normal price.
const TRIAL_OFFER_COUPON_ID = 'trial-offer-premium-1mois-2eur';
const TRIAL_OFFER_AMOUNT_OFF_CENTS =
  (PLAN_DEFINITIONS[TRIAL_OFFER_TIER].priceEuros - TRIAL_OFFER_PRICE_EUROS) * 100;

const PRICE_ID_ENV_KEY_BY_TIER: Record<PlanTier, string> = {
  [PlanTier.ESSENTIEL]: 'STRIPE_PRICE_ID_ESSENTIEL',
  [PlanTier.PRO]: 'STRIPE_PRICE_ID_PRO',
  [PlanTier.PREMIUM]: 'STRIPE_PRICE_ID_PREMIUM',
};

export interface LaunchOfferInfo {
  active: boolean;
  expiresAt: Date | null;
  amountOffCents: number;
  durationMonths: number;
}

// Isolated from BillingService on purpose, same "isolate the risky external
// boundary" split as GroqClientService/MailerService: this class only ever
// knows about the raw Stripe SDK calls (customer, checkout, portal,
// webhook signature verification) — never Company rows, plan-access rules,
// or promo codes. STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET are optional like
// GROQ_API_KEY (see docs/roadmap.md Phase 14): the app boots fine with none
// of them set, every method here just throws StripeUnavailableError.
//
// Phase 30: a single STRIPE_PRICE_ID became 3 (STRIPE_PRICE_ID_ESSENTIEL/
// _PRO/_PREMIUM), each independently optional — isConfigured() only
// requires the secret key + webhook secret + at least one tier's price id,
// so a deployment can ship with just STRIPE_PRICE_ID_PREMIUM (the pre-Phase-
// 30 price, renamed) and light up Essentiel/Pro later with no redeploy, see
// isTierAvailable/availableTiers.
@Injectable()
export class StripeClientService {
  private readonly logger = new Logger(StripeClientService.name);
  private readonly client?: Stripe;
  private readonly webhookSecret?: string;
  private readonly priceIdByTier: Partial<Record<PlanTier, string>> = {};
  private readonly tierByPriceId = new Map<string, PlanTier>();
  private readonly launchOfferExpiresAt: Date | null;

  constructor(config: ConfigService) {
    const secretKey = config.get<string>('STRIPE_SECRET_KEY');
    this.client = secretKey ? new Stripe(secretKey) : undefined;
    this.webhookSecret = config.get<string>('STRIPE_WEBHOOK_SECRET');

    for (const tier of PLAN_TIER_ORDER) {
      const priceId = config.get<string>(PRICE_ID_ENV_KEY_BY_TIER[tier]);
      if (priceId) {
        this.priceIdByTier[tier] = priceId;
        this.tierByPriceId.set(priceId, tier);
      }
    }

    const launchOfferExpiresAt = config.get<string>('LAUNCH_OFFER_EXPIRES_AT');
    this.launchOfferExpiresAt = launchOfferExpiresAt ? new Date(launchOfferExpiresAt) : null;
  }

  // Billing subsystem operational at all — checkout/portal/webhook routes
  // report 503 until this is true. Deliberately does not require every
  // tier's price id (see isTierAvailable/availableTiers above).
  isConfigured(): boolean {
    return Boolean(this.client && this.webhookSecret && Object.keys(this.priceIdByTier).length > 0);
  }

  isTierAvailable(tier: PlanTier): boolean {
    return Boolean(this.client && this.webhookSecret && this.priceIdByTier[tier]);
  }

  availableTiers(): PlanTier[] {
    return PLAN_TIER_ORDER.filter((tier) => this.isTierAvailable(tier));
  }

  // Resolves a live Stripe subscription's price id back to one of our 3
  // tiers — see BillingService.applySubscriptionEvent. Null if the price id
  // doesn't match any configured tier (never guessed at in that case).
  resolveTierFromPriceId(priceId: string | undefined): PlanTier | null {
    return priceId ? (this.tierByPriceId.get(priceId) ?? null) : null;
  }

  isLaunchOfferActive(): boolean {
    return Boolean(this.launchOfferExpiresAt && this.launchOfferExpiresAt > new Date());
  }

  launchOfferInfo(): LaunchOfferInfo {
    return {
      active: this.isLaunchOfferActive(),
      expiresAt: this.launchOfferExpiresAt,
      amountOffCents: LAUNCH_OFFER_AMOUNT_OFF_CENTS,
      durationMonths: LAUNCH_OFFER_DURATION_MONTHS,
    };
  }

  private requireClient(): Stripe {
    if (!this.client) {
      throw new StripeUnavailableError('STRIPE_SECRET_KEY is not configured');
    }
    return this.client;
  }

  async createCustomer(email: string, companyId: string): Promise<Stripe.Customer> {
    return this.requireClient().customers.create({ email, metadata: { companyId } });
  }

  // subscription_data.metadata carries companyId onto the Subscription
  // object itself (not just the Checkout Session, which the webhook never
  // sees again) — belt-and-suspenders alongside looking the company up by
  // stripeCustomerId, in case a customer is ever reused across a scenario
  // metadata lookup handles more directly.
  async createCheckoutSession(params: {
    tier: PlanTier;
    customerId: string;
    successUrl: string;
    cancelUrl: string;
    companyId: string;
    idempotencyKey: string;
    discountCouponId?: string;
  }): Promise<Stripe.Checkout.Session> {
    const client = this.requireClient();
    const priceId = this.priceIdByTier[params.tier];
    if (!priceId) {
      throw new StripeUnavailableError(
        `${PRICE_ID_ENV_KEY_BY_TIER[params.tier]} is not configured`,
      );
    }
    return client.checkout.sessions.create(
      {
        mode: 'subscription',
        customer: params.customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        subscription_data: { metadata: { companyId: params.companyId } },
        ...(params.discountCouponId ? { discounts: [{ coupon: params.discountCouponId }] } : {}),
      },
      // Same key -> Stripe returns the original Session instead of minting a
      // second one, so a retried/duplicated request can never turn into a
      // second subscription (see BillingService.buildCheckoutIdempotencyKey).
      { idempotencyKey: params.idempotencyKey },
    );
  }

  // Idempotent by construction: a fixed coupon id is looked up first, and
  // only created on a genuine 404. A concurrent creator racing this exact
  // id is harmless: Stripe rejects the loser's create call, treated the
  // same as "it already existed".
  async ensureReferralDiscountCoupon(): Promise<string> {
    const client = this.requireClient();
    try {
      await client.coupons.retrieve(REFERRAL_DISCOUNT_COUPON_ID);
      return REFERRAL_DISCOUNT_COUPON_ID;
    } catch {
      try {
        await client.coupons.create({
          id: REFERRAL_DISCOUNT_COUPON_ID,
          percent_off: REFERRAL_DISCOUNT_PERCENT_OFF,
          duration: 'once',
        });
      } catch (error) {
        this.logger.debug(`Referral discount coupon create raced or failed: ${String(error)}`);
      }
      return REFERRAL_DISCOUNT_COUPON_ID;
    }
  }

  // Same idempotent-by-construction pattern as the referral coupon above.
  async ensureLaunchOfferCoupon(): Promise<string> {
    const client = this.requireClient();
    try {
      await client.coupons.retrieve(LAUNCH_OFFER_COUPON_ID);
      return LAUNCH_OFFER_COUPON_ID;
    } catch {
      try {
        await client.coupons.create({
          id: LAUNCH_OFFER_COUPON_ID,
          amount_off: LAUNCH_OFFER_AMOUNT_OFF_CENTS,
          currency: 'eur',
          duration: 'repeating',
          duration_in_months: LAUNCH_OFFER_DURATION_MONTHS,
        });
      } catch (error) {
        this.logger.debug(`Launch offer coupon create raced or failed: ${String(error)}`);
      }
      return LAUNCH_OFFER_COUPON_ID;
    }
  }

  // Same idempotent-by-construction pattern as the other two coupons above.
  async ensureTrialOfferCoupon(): Promise<string> {
    const client = this.requireClient();
    try {
      await client.coupons.retrieve(TRIAL_OFFER_COUPON_ID);
      return TRIAL_OFFER_COUPON_ID;
    } catch {
      try {
        await client.coupons.create({
          id: TRIAL_OFFER_COUPON_ID,
          amount_off: TRIAL_OFFER_AMOUNT_OFF_CENTS,
          currency: 'eur',
          duration: 'once',
        });
      } catch (error) {
        this.logger.debug(`Trial offer coupon create raced or failed: ${String(error)}`);
      }
      return TRIAL_OFFER_COUPON_ID;
    }
  }

  // Applied directly to an already-live subscription — the rare case where
  // a filleul's referral gets confirmed after they've already subscribed
  // (see BillingService.grantReferralDiscount). Takes effect on their next
  // invoice ('once' duration on the coupon itself).
  async applyCouponToSubscription(subscriptionId: string, couponId: string): Promise<void> {
    await this.requireClient().subscriptions.update(subscriptionId, {
      discounts: [{ coupon: couponId }],
    });
  }

  async createPortalSession(
    customerId: string,
    returnUrl: string,
  ): Promise<Stripe.BillingPortal.Session> {
    return this.requireClient().billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  }

  constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const client = this.requireClient();
    if (!this.webhookSecret) {
      throw new StripeUnavailableError('STRIPE_WEBHOOK_SECRET is not configured');
    }
    return client.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
  }
}
