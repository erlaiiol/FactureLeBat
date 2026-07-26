import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { StripeUnavailableError } from './stripe-unavailable.error';

// Isolated from BillingService on purpose, same "isolate the risky external
// boundary" split as GroqClientService/MailerService: this class only ever
// knows about the raw Stripe SDK calls (customer, checkout, portal,
// webhook signature verification) — never Company rows, premium-access
// rules, or promo codes. STRIPE_SECRET_KEY/STRIPE_PRICE_ID/
// STRIPE_WEBHOOK_SECRET are optional like GROQ_API_KEY (see
// docs/roadmap.md Phase 14): the app boots fine with none of them set,
// every method here just throws StripeUnavailableError until all three are
// configured.
@Injectable()
export class StripeClientService {
  private readonly client?: Stripe;
  private readonly priceId?: string;
  private readonly webhookSecret?: string;

  constructor(config: ConfigService) {
    const secretKey = config.get<string>('STRIPE_SECRET_KEY');
    this.client = secretKey ? new Stripe(secretKey) : undefined;
    this.priceId = config.get<string>('STRIPE_PRICE_ID');
    this.webhookSecret = config.get<string>('STRIPE_WEBHOOK_SECRET');
  }

  // Checkout/portal need the client + a price to sell; the webhook needs
  // the client + a secret to verify signatures — reported as one combined
  // flag since a deployment configuring Stripe billing at all should set
  // every one of the three together (see .env.example).
  isConfigured(): boolean {
    return Boolean(this.client && this.priceId && this.webhookSecret);
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
    customerId: string;
    successUrl: string;
    cancelUrl: string;
    companyId: string;
    idempotencyKey: string;
  }): Promise<Stripe.Checkout.Session> {
    const client = this.requireClient();
    if (!this.priceId) {
      throw new StripeUnavailableError('STRIPE_PRICE_ID is not configured');
    }
    return client.checkout.sessions.create(
      {
        mode: 'subscription',
        customer: params.customerId,
        line_items: [{ price: this.priceId, quantity: 1 }],
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        subscription_data: { metadata: { companyId: params.companyId } },
      },
      // Same key -> Stripe returns the original Session instead of minting a
      // second one, so a retried/duplicated request can never turn into a
      // second subscription (see BillingService.buildCheckoutIdempotencyKey).
      { idempotencyKey: params.idempotencyKey },
    );
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
