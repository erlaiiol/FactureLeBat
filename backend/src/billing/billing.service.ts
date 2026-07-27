import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { SubscriptionStatus } from '../../generated/prisma/enums';
import { AlreadySubscribedError } from './already-subscribed.error';
import { BillingRepository } from './billing.repository';
import { BillingStatus } from './entities/billing-status.entity';
import { NoBillingCustomerError } from './no-billing-customer.error';
import { hasPremiumAccess } from './premium-gate.service';
import { StripeClientService } from './stripe/stripe-client.service';
import { mapStripeSubscriptionStatus } from './stripe/subscription-status.util';

// Same idempotency key for every checkout-session request from a given
// company within this window, so a double-click, an impatient reload+retry,
// or two tabs open at once all collapse onto the single Stripe Checkout
// Session Stripe creates for the first one of them — the artisan can never
// complete two of them and end up with two subscriptions. Wide enough to
// absorb a slow reload, short enough that a genuinely later, deliberate
// subscribe attempt (e.g. after actually canceling first) still gets its
// own session.
const CHECKOUT_IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;

function buildCheckoutIdempotencyKey(companyId: string): string {
  const windowIndex = Math.floor(Date.now() / CHECKOUT_IDEMPOTENCY_WINDOW_MS);
  return `checkout:${companyId}:${windowIndex}`;
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
    const [fields, invoiceCount] = await Promise.all([
      this.repository.getBillingFields(companyId),
      this.repository.countInvoices(companyId),
    ]);
    return {
      subscriptionStatus: fields.subscriptionStatus,
      hasPremiumAccess: hasPremiumAccess(fields),
      currentPeriodEnd: fields.currentPeriodEnd,
      cancelAtPeriodEnd: fields.cancelAtPeriodEnd,
      premiumGrantedUntil: fields.premiumGrantedUntil,
      freeInvoiceUsed: invoiceCount >= 1,
      stripeConfigured: this.stripeClient.isConfigured(),
    };
  }

  // Reuses an existing Stripe Customer if this company already has one
  // (e.g. a lapsed/canceled subscriber resubscribing) rather than creating
  // a duplicate — Stripe has no natural dedupe key for this, so
  // stripeCustomerId is the one this app owns and persists on first use.
  async createCheckoutSession(companyId: string, email: string): Promise<{ url: string }> {
    const fields = await this.repository.getBillingFields(companyId);

    // A subscription already exists on this customer (paying fine, or
    // paying but currently failing) — starting a second Checkout Session
    // would risk a second, parallel Stripe subscription and a real double
    // charge, not just a UI inconsistency. PAST_DUE is fixed through the
    // billing portal (update payment method on the existing subscription),
    // never by subscribing again.
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

    // Phase 29: a filleul whose referral reward fired before they ever
    // subscribed (the normal case) has pendingReferralDiscount set — attach
    // the coupon to this checkout rather than losing the reward. Left set
    // until BillingService.applySubscriptionEvent confirms the resulting
    // subscription, so an abandoned checkout doesn't burn it.
    const discountCouponId = fields.pendingReferralDiscount
      ? await this.stripeClient.ensureReferralDiscountCoupon()
      : undefined;

    const session = await this.stripeClient.createCheckoutSession({
      customerId,
      companyId,
      successUrl: `${this.frontendUrl}/abonnement?success=1`,
      cancelUrl: `${this.frontendUrl}/abonnement?canceled=1`,
      idempotencyKey: buildCheckoutIdempotencyKey(companyId),
      discountCouponId,
    });

    if (!session.url) {
      throw new Error('Stripe did not return a Checkout Session URL');
    }
    return { url: session.url };
  }

  // Lets a subscribed artisan manage/cancel their subscription through
  // Stripe's own hosted portal instead of this app reimplementing
  // cancellation UI — requires an existing customer (a company that has
  // never started a checkout has nothing to manage yet).
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

  // Phase 29: the filleul side of the referral reward — 5€ off their first
  // billing cycle. A no-op deployment with no Stripe configured has no
  // subscription price to discount in the first place, same "optional
  // feature, boots fine without it" posture as the rest of billing/. Called
  // from ReferralService.grantRewardForVerifiedEmail, which already
  // guarantees this fires at most once per company (Referral.
  // referredCompanyId is @@unique).
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

    const currentPeriodEndUnix = subscription.items.data[0]?.current_period_end;
    await this.repository.applySubscriptionUpdate(companyId, {
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: mapStripeSubscriptionStatus(subscription.status),
      currentPeriodEnd: currentPeriodEndUnix ? new Date(currentPeriodEndUnix * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    });
  }
}
