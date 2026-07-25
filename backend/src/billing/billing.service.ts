import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { BillingRepository } from './billing.repository';
import { BillingStatus } from './entities/billing-status.entity';
import { NoBillingCustomerError } from './no-billing-customer.error';
import { hasPremiumAccess } from './premium-gate.service';
import { StripeClientService } from './stripe/stripe-client.service';
import { mapStripeSubscriptionStatus } from './stripe/subscription-status.util';

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
    let customerId = fields.stripeCustomerId;
    if (!customerId) {
      const customer = await this.stripeClient.createCustomer(email, companyId);
      customerId = customer.id;
      await this.repository.setStripeCustomerId(companyId, customerId);
    }

    const session = await this.stripeClient.createCheckoutSession({
      customerId,
      companyId,
      successUrl: `${this.frontendUrl}/abonnement?success=1`,
      cancelUrl: `${this.frontendUrl}/abonnement?canceled=1`,
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
