import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import type { JWSTransactionDecodedPayload } from '@apple/app-store-server-library';
import type Stripe from 'stripe';
import { PlanTier } from '../generated/prisma/enums';
import { PrismaService } from '../src/database/prisma.service';
import { AppleServerClientService } from '../src/billing/apple/apple-server-client.service';
import { StripeClientService } from '../src/billing/stripe/stripe-client.service';
import { BillingStatus } from '../src/billing/entities/billing-status.entity';
import { PlanCatalog } from '../src/billing/entities/plan-catalog.entity';
import { TRIAL_OFFER_PRICE_EUROS, TRIAL_OFFER_TIER } from '../src/billing/plan-config';
import { authedRequest, registerTestUser, TestSession } from './utils/auth';
import { createTestApp } from './utils/test-app';

// First-invoice → subscription pipeline, end to end on the backend side:
// a brand-new account creates its first invoice (free), is then offered a
// subscription, and every way out of that offer reaches a real payment
// entry point — a Stripe Checkout URL (web + Android, which both pay
// through Stripe) or a verified App Store purchase (iOS). The frontend half
// of the same pipeline (which modal shows on which platform, and that it
// lands on the Stripe redirect / StoreKit sheet) lives in
// frontend/e2e/first-invoice-subscription.spec.ts.
//
// Stripe and Apple are the only things faked here: their client services
// are spied on so no network call ever leaves the machine, while every
// layer this app owns (plan gate, trial-offer window, coupon choice,
// purchase verification bookkeeping) runs for real against the local dev
// Postgres, same convention as invoice.e2e-spec.ts.
describe('First invoice → subscription pipeline (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let stripeClient: StripeClientService;
  let appleClient: AppleServerClientService;
  let createCheckoutSessionSpy: jest.SpiedFunction<StripeClientService['createCheckoutSession']>;
  const sessions: TestSession[] = [];

  const guidedBody = {
    customerName: 'Pipeline Customer',
    lines: [{ description: 'Parquet', unit: 'UNIT', quantity: 1, unitPriceCents: 1000 }],
  };
  const manualBody = {
    customerName: 'Pipeline Customer',
    entryMode: 'MANUAL',
    manualTable: {
      columns: [
        { role: 'DESCRIPTION', label: 'Désignation' },
        { role: 'QUANTITY', label: 'Quantité' },
        { role: 'UNIT_PRICE', label: 'Prix unitaire' },
        { role: 'LINE_TOTAL', label: 'Total' },
      ],
      rows: [{ cells: ['Parquet', '1', '10.00', '10.00'] }],
    },
  };

  async function newAccount(): Promise<TestSession> {
    const session = await registerTestUser(app);
    sessions.push(session);
    return session;
  }

  async function billingStatus(session: TestSession): Promise<BillingStatus> {
    const response = await authedRequest(app, session).get('/api/billing/status').expect(200);
    return response.body as BillingStatus;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    stripeClient = app.get(StripeClientService);
    appleClient = app.get(AppleServerClientService);
  });

  beforeEach(() => {
    jest.spyOn(stripeClient, 'isConfigured').mockReturnValue(true);
    jest
      .spyOn(stripeClient, 'availableTiers')
      .mockReturnValue([PlanTier.ESSENTIEL, PlanTier.PRO, PlanTier.PREMIUM]);
    jest.spyOn(stripeClient, 'isLaunchOfferActive').mockReturnValue(false);
    // Company.stripeCustomerId is unique — one fake customer per company.
    jest
      .spyOn(stripeClient, 'createCustomer')
      .mockImplementation((_email, companyId) =>
        Promise.resolve({ id: `cus_e2e_${companyId}` } as Stripe.Customer),
      );
    jest.spyOn(stripeClient, 'ensureTrialOfferCoupon').mockResolvedValue('coupon_e2e_trial');
    jest.spyOn(stripeClient, 'ensureLaunchOfferCoupon').mockResolvedValue('coupon_e2e_launch');
    createCheckoutSessionSpy = jest.spyOn(stripeClient, 'createCheckoutSession').mockResolvedValue({
      url: 'https://checkout.stripe.com/c/pay/cs_test_e2e',
    } as Stripe.Checkout.Session);

    jest.spyOn(appleClient, 'isConfigured').mockReturnValue(true);
    jest
      .spyOn(appleClient, 'productIdForTier')
      .mockImplementation((tier) => `net.facturele.app.${tier.toLowerCase()}.monthly`);
    jest
      .spyOn(appleClient, 'resolveTierFromProductId')
      .mockImplementation((productId) =>
        productId === 'net.facturele.app.premium.monthly' ? PlanTier.PREMIUM : null,
      );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    for (const session of sessions) {
      await prisma.company.delete({ where: { id: session.companyId } });
    }
    await app.close();
  });

  it('gives a brand-new account its first mode-rapide invoice for free, with no offer yet', async () => {
    const session = await newAccount();

    const before = await billingStatus(session);
    expect(before.hasPremiumAccess).toBe(false);
    expect(before.freeInvoiceUsed).toBe(false);
    expect(before.trialOffer).toBeNull();

    await authedRequest(app, session).post('/api/invoices/preview').send(guidedBody).expect(201);
    await authedRequest(app, session).post('/api/invoices').send(guidedBody).expect(201);
  });

  describe.each([
    ['mode rapide', guidedBody],
    ['mode manuel', manualBody],
  ])('right after the first invoice (%s)', (_label, firstInvoiceBody) => {
    let session: TestSession;

    beforeEach(async () => {
      session = await newAccount();
      await authedRequest(app, session).post('/api/invoices').send(firstInvoiceBody).expect(201);
    });

    it('opens the time-limited trial offer on the status the frontend re-fetches', async () => {
      const status = await billingStatus(session);
      expect(status.hasPremiumAccess).toBe(false);
      expect(status.trialOffer).not.toBeNull();
      expect(status.trialOffer!.tier).toBe(TRIAL_OFFER_TIER);
      expect(status.trialOffer!.discountedPriceEuros).toBe(TRIAL_OFFER_PRICE_EUROS);
      expect(new Date(status.trialOffer!.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('web/Android: the offer ends in a Stripe Checkout URL carrying the trial coupon', async () => {
      const response = await authedRequest(app, session)
        .post('/api/billing/checkout-session')
        .send({ tier: TRIAL_OFFER_TIER })
        .expect(201);

      expect((response.body as { url: string }).url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
      expect(createCheckoutSessionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tier: TRIAL_OFFER_TIER,
          companyId: session.companyId,
          discountCouponId: 'coupon_e2e_trial',
        }),
      );
    });

    it('iOS: every plan exposes an App Store product id, and a verified purchase unlocks invoicing', async () => {
      const plans = (await authedRequest(app, session).get('/api/billing/plans').expect(200))
        .body as PlanCatalog;
      for (const plan of plans.plans) {
        expect(plan.appleProductId).toEqual(expect.any(String));
      }
      expect((await billingStatus(session)).appleConfigured).toBe(true);

      const verifiedTransaction: JWSTransactionDecodedPayload = {
        originalTransactionId: `e2e-${session.companyId}`,
        productId: 'net.facturele.app.premium.monthly',
        expiresDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
      };
      jest.spyOn(appleClient, 'verifyTransaction').mockResolvedValue(verifiedTransaction);

      const verify = await authedRequest(app, session)
        .post('/api/billing/apple/verify-purchase')
        .send({ signedTransactionInfo: 'fake.storekit.jws' })
        .expect(201);
      expect((verify.body as { tier: PlanTier | null }).tier).toBe(PlanTier.PREMIUM);

      const status = await billingStatus(session);
      expect(status.hasPremiumAccess).toBe(true);
      expect(status.trialOffer).toBeNull();
      await authedRequest(app, session).post('/api/invoices').send(guidedBody).expect(201);
    });
  });

  describe('once the free invoice is used', () => {
    let session: TestSession;

    beforeEach(async () => {
      session = await newAccount();
      await authedRequest(app, session).post('/api/invoices').send(guidedBody).expect(201);
    });

    it('refuses the next mode-rapide invoice with the 402 PremiumRequired the paywall listens for', async () => {
      const preview = await authedRequest(app, session)
        .post('/api/invoices/preview')
        .send(guidedBody)
        .expect(402);
      expect((preview.body as { error: string }).error).toBe('PremiumRequired');

      const create = await authedRequest(app, session)
        .post('/api/invoices')
        .send(guidedBody)
        .expect(402);
      expect((create.body as { error: string }).error).toBe('PremiumRequired');
    });

    it('still reaches Stripe Checkout once the trial offer has expired, at the regular price', async () => {
      await prisma.company.update({
        where: { id: session.companyId },
        data: { trialOfferExpiresAt: new Date(Date.now() - 1000) },
      });
      expect((await billingStatus(session)).trialOffer).toBeNull();

      const response = await authedRequest(app, session)
        .post('/api/billing/checkout-session')
        .send({ tier: PlanTier.PREMIUM })
        .expect(201);

      expect((response.body as { url: string }).url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
      expect(createCheckoutSessionSpy).toHaveBeenCalledWith(
        expect.objectContaining({ tier: PlanTier.PREMIUM, discountCouponId: undefined }),
      );
    });
  });
});
