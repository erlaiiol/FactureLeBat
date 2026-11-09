import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import type Stripe from 'stripe';
import { AuthTokenPurpose, PlanTier, SubscriptionStatus } from '../generated/prisma/enums';
import { hashToken } from '../src/auth/token.util';
import { PrismaService } from '../src/database/prisma.service';
import { BillingStatus } from '../src/billing/entities/billing-status.entity';
import { PlanCatalog } from '../src/billing/entities/plan-catalog.entity';
import { StripeClientService } from '../src/billing/stripe/stripe-client.service';
import { ReferralStatusEntity } from '../src/referral/entities/referral-status.entity';
import { REFERRAL_PARRAIN_REWARD_DAYS_BY_TIER } from '../src/referral/referral.constants';
import { authedRequest, registerTestUser, TestSession } from './utils/auth';
import { createTestApp } from './utils/test-app';

// Referral program (Phases 29/30) and what it does to subscriptions, end to
// end on the backend: a code is minted for every company, attached at
// sign-up, and only pays out once the *filleul's email is verified* — the
// parrain then gets Premium days scaled by their own tier at that moment,
// the filleul gets a -30% Stripe coupon on their first billing cycle
// (picked up by the next Checkout Session, or applied straight to a live
// subscription). The browser half lives in frontend/e2e/referral.e2e.ts.
//
// Only Stripe is faked (spied, so nothing leaves the machine); the
// referral/billing/plan-gate layers and the verify-email flow run for real
// against the local dev Postgres, same convention as the other e2e specs.
describe('Referral program → subscriptions (e2e)', () => {
  // Most cases register 2-3 accounts (bcrypt) — well past Jest's 5 s default.
  jest.setTimeout(60_000);

  let app: INestApplication<App>;
  let prisma: PrismaService;
  let stripeClient: StripeClientService;
  let createCheckoutSessionSpy: jest.SpiedFunction<StripeClientService['createCheckoutSession']>;
  let applyCouponSpy: jest.SpiedFunction<StripeClientService['applyCouponToSubscription']>;
  let stripeConfigured: jest.SpiedFunction<StripeClientService['isConfigured']>;
  let launchOfferActive: jest.SpiedFunction<StripeClientService['isLaunchOfferActive']>;
  const sessions: TestSession[] = [];

  const DAY_MS = 24 * 60 * 60 * 1000;
  const guidedBody = {
    customerName: 'Referral Customer',
    lines: [{ description: 'Parquet', unit: 'UNIT', quantity: 1, unitPriceCents: 1000 }],
  };

  async function newAccount(referralCode?: string): Promise<TestSession> {
    const session = await registerTestUser(app, { referralCode });
    sessions.push(session);
    return session;
  }

  async function referralCodeOf(session: TestSession): Promise<string> {
    return (await referralStatus(session)).code;
  }

  async function referralStatus(session: TestSession): Promise<ReferralStatusEntity> {
    const response = await authedRequest(app, session).get('/api/referral/me').expect(200);
    return response.body as ReferralStatusEntity;
  }

  async function billingStatus(session: TestSession): Promise<BillingStatus> {
    const response = await authedRequest(app, session).get('/api/billing/status').expect(200);
    return response.body as BillingStatus;
  }

  // The same call the "verify your email" link in the sign-up email makes —
  // the token row is inserted directly because the raw token only ever
  // exists in the email (SMTP isn't configured here).
  async function verifyEmail(session: TestSession): Promise<request.Response> {
    const user = await prisma.user.findFirstOrThrow({ where: { companyId: session.companyId } });
    const rawToken = `e2e-verify-${session.companyId}-${Math.random().toString(36).slice(2)}`;
    await prisma.authToken.create({
      data: {
        userId: user.id,
        purpose: AuthTokenPurpose.EMAIL_VERIFICATION,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    return request(app.getHttpServer()).post('/api/auth/verify-email').send({ token: rawToken });
  }

  async function referrerWithTier(tier: PlanTier | null): Promise<TestSession> {
    const session = await newAccount();
    if (tier) {
      await prisma.company.update({
        where: { id: session.companyId },
        data: {
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          subscriptionPlanTier: tier,
        },
      });
    }
    return session;
  }

  async function referredBy(referrer: TestSession, code?: string): Promise<TestSession> {
    return newAccount(code ?? (await referralCodeOf(referrer)));
  }

  async function grantFields(session: TestSession) {
    return prisma.company.findUniqueOrThrow({
      where: { id: session.companyId },
      select: {
        premiumGrantedUntil: true,
        grantedPlanTier: true,
        pendingReferralDiscount: true,
      },
    });
  }

  function wholeDaysFromNow(date: Date | null): number {
    expect(date).not.toBeNull();
    return Math.round((date!.getTime() - Date.now()) / DAY_MS);
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    stripeClient = app.get(StripeClientService);
  });

  beforeEach(() => {
    stripeConfigured = jest.spyOn(stripeClient, 'isConfigured').mockReturnValue(true);
    jest
      .spyOn(stripeClient, 'availableTiers')
      .mockReturnValue([PlanTier.ESSENTIEL, PlanTier.PRO, PlanTier.PREMIUM]);
    launchOfferActive = jest.spyOn(stripeClient, 'isLaunchOfferActive').mockReturnValue(false);
    jest
      .spyOn(stripeClient, 'createCustomer')
      .mockImplementation((_email, companyId) =>
        Promise.resolve({ id: `cus_e2e_${companyId}` } as Stripe.Customer),
      );
    jest
      .spyOn(stripeClient, 'ensureReferralDiscountCoupon')
      .mockResolvedValue('coupon_e2e_referral');
    jest.spyOn(stripeClient, 'ensureTrialOfferCoupon').mockResolvedValue('coupon_e2e_trial');
    jest.spyOn(stripeClient, 'ensureLaunchOfferCoupon').mockResolvedValue('coupon_e2e_launch');
    applyCouponSpy = jest.spyOn(stripeClient, 'applyCouponToSubscription').mockResolvedValue();
    createCheckoutSessionSpy = jest.spyOn(stripeClient, 'createCheckoutSession').mockResolvedValue({
      url: 'https://checkout.stripe.com/c/pay/cs_test_e2e',
    } as Stripe.Checkout.Session);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    // Referral rows cascade from either company.
    for (const session of sessions) {
      await prisma.company.deleteMany({ where: { id: session.companyId } });
    }
    await app.close();
  });

  describe('referral codes', () => {
    it('mints a distinct, well-formed code for every new company, with nothing earned yet', async () => {
      const [a, b] = [await newAccount(), await newAccount()];

      const statusA = await referralStatus(a);
      const statusB = await referralStatus(b);
      expect(statusA.code).toMatch(/^[A-Z2-9]{6,10}$/);
      expect(statusB.code).toMatch(/^[A-Z2-9]{6,10}$/);
      expect(statusA.code).not.toBe(statusB.code);
      expect(statusA).toMatchObject({ confirmedReferrals: 0, rewardDaysEarned: 0 });
    });

    it('validates a code publicly (no session), ignoring case and surrounding spaces, and rejects unknown ones', async () => {
      const code = await referralCodeOf(await newAccount());
      const validate = async (raw: string) =>
        (await request(app.getHttpServer()).get(`/api/referral/validate/${raw}`).expect(200))
          .body as { valid: boolean };

      expect(await validate(code)).toEqual({ valid: true });
      expect(await validate(code.toLowerCase())).toEqual({ valid: true });
      expect(await validate(encodeURIComponent(` ${code} `))).toEqual({ valid: true });
      expect(await validate('ZZZZZZZZ')).toEqual({ valid: false });
    });

    it('requires a session to read one’s own referral status', async () => {
      await request(app.getHttpServer()).get('/api/referral/me').expect(401);
    });
  });

  describe('attribution at sign-up', () => {
    it('links the new company to its parrain without paying anything out before the email is verified', async () => {
      const parrain = await referrerWithTier(null);
      const filleul = await referredBy(parrain);

      const referral = await prisma.referral.findUniqueOrThrow({
        where: { referredCompanyId: filleul.companyId },
      });
      expect(referral.referrerCompanyId).toBe(parrain.companyId);
      expect(referral.rewardGrantedAt).toBeNull();

      expect(await referralStatus(parrain)).toMatchObject({
        confirmedReferrals: 0,
        rewardDaysEarned: 0,
      });
      expect((await grantFields(parrain)).premiumGrantedUntil).toBeNull();
      expect((await grantFields(filleul)).pendingReferralDiscount).toBe(false);
      expect((await billingStatus(parrain)).hasPremiumAccess).toBe(false);
    });

    it('accepts the code in any case', async () => {
      const parrain = await referrerWithTier(null);
      const filleul = await referredBy(parrain, (await referralCodeOf(parrain)).toLowerCase());

      expect(
        await prisma.referral.count({
          where: { referrerCompanyId: parrain.companyId, referredCompanyId: filleul.companyId },
        }),
      ).toBe(1);
    });

    it('never blocks sign-up on an unknown code, and records no referral', async () => {
      const filleul = await newAccount('ZZZZZZZZ');

      expect(await prisma.referral.count({ where: { referredCompanyId: filleul.companyId } })).toBe(
        0,
      );
      // …and that account still gets a code of its own.
      expect((await referralStatus(filleul)).code).toMatch(/^[A-Z2-9]{6,10}$/);
    });

    it('records no referral for an account that signs up without any code', async () => {
      const account = await newAccount();
      expect(await prisma.referral.count({ where: { referredCompanyId: account.companyId } })).toBe(
        0,
      );
    });
  });

  describe('reward on email verification — the parrain', () => {
    it('gives a parrain with no plan 10 Premium days, which unlock the app and show in their status', async () => {
      const parrain = await referrerWithTier(null);
      const filleul = await referredBy(parrain);

      await verifyEmail(filleul).then((res) => expect(res.status).toBe(200));

      const grant = await grantFields(parrain);
      expect(grant.grantedPlanTier).toBe(PlanTier.PREMIUM);
      expect(wholeDaysFromNow(grant.premiumGrantedUntil)).toBe(
        REFERRAL_PARRAIN_REWARD_DAYS_BY_TIER[PlanTier.ESSENTIEL],
      );
      expect(await referralStatus(parrain)).toMatchObject({
        confirmedReferrals: 1,
        rewardDaysEarned: 10,
      });
      expect((await billingStatus(parrain)).hasPremiumAccess).toBe(true);
    });

    it.each([
      [PlanTier.ESSENTIEL, 10],
      [PlanTier.PRO, 20],
      [PlanTier.PREMIUM, 30],
    ])('scales the reward with a %s parrain’s own tier: %i Premium days', async (tier, days) => {
      const parrain = await referrerWithTier(tier);
      const filleul = await referredBy(parrain);

      await verifyEmail(filleul).then((res) => expect(res.status).toBe(200));

      expect(wholeDaysFromNow((await grantFields(parrain)).premiumGrantedUntil)).toBe(days);
      expect((await referralStatus(parrain)).rewardDaysEarned).toBe(days);
    });

    it('lifts a Pro subscriber to Premium for the duration of the grant, without touching their subscription', async () => {
      const parrain = await referrerWithTier(PlanTier.PRO);
      await verifyEmail(await referredBy(parrain)).then((res) => expect(res.status).toBe(200));

      const company = await prisma.company.findUniqueOrThrow({
        where: { id: parrain.companyId },
        select: { subscriptionPlanTier: true, subscriptionStatus: true, grantedPlanTier: true },
      });
      expect(company).toEqual({
        subscriptionPlanTier: PlanTier.PRO,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        grantedPlanTier: PlanTier.PREMIUM,
      });
    });

    it('pays nothing while the filleul has not verified, and pays once when they do — never twice', async () => {
      const parrain = await referrerWithTier(null);
      const filleul = await referredBy(parrain);
      expect((await referralStatus(parrain)).confirmedReferrals).toBe(0);

      await verifyEmail(filleul).then((res) => expect(res.status).toBe(200));
      const afterFirst = (await grantFields(parrain)).premiumGrantedUntil;

      // A second valid verification token (e.g. "resend verification" used
      // twice) must not re-trigger the reward.
      await verifyEmail(filleul).then((res) => expect(res.status).toBe(200));

      expect((await grantFields(parrain)).premiumGrantedUntil).toEqual(afterFirst);
      expect(await referralStatus(parrain)).toMatchObject({
        confirmedReferrals: 1,
        rewardDaysEarned: 10,
      });
    });

    it('rejects a verification token that was already used', async () => {
      const filleul = await newAccount();
      const user = await prisma.user.findFirstOrThrow({ where: { companyId: filleul.companyId } });
      const rawToken = `e2e-replay-${filleul.companyId}`;
      await prisma.authToken.create({
        data: {
          userId: user.id,
          purpose: AuthTokenPurpose.EMAIL_VERIFICATION,
          tokenHash: hashToken(rawToken),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      const verify = () =>
        request(app.getHttpServer()).post('/api/auth/verify-email').send({ token: rawToken });

      await verify().expect(200);
      expect((await verify()).status).toBeGreaterThanOrEqual(400);
    });

    it('accumulates one reward per verified filleul, each recorded with its own day count', async () => {
      const parrain = await referrerWithTier(PlanTier.ESSENTIEL);
      const code = await referralCodeOf(parrain);
      const first = await newAccount(code);
      const second = await newAccount(code);
      const third = await newAccount(code); // never verifies

      await verifyEmail(first).then((res) => expect(res.status).toBe(200));
      await verifyEmail(second).then((res) => expect(res.status).toBe(200));

      const rows = await prisma.referral.findMany({
        where: { referrerCompanyId: parrain.companyId },
        orderBy: { rewardGrantedAt: 'asc' },
      });
      expect(rows).toHaveLength(3);
      const rewarded = rows.filter((row) => row.rewardGrantedAt);
      expect(rewarded).toHaveLength(2);
      expect(rows.find((row) => row.referredCompanyId === third.companyId)?.rewardGrantedAt).toBe(
        null,
      );

      const status = await referralStatus(parrain);
      expect(status.confirmedReferrals).toBe(2);
      expect(status.rewardDaysEarned).toBe(
        rewarded.reduce((sum, row) => sum + (row.rewardDaysGranted ?? 0), 0),
      );
      // The grants stack on one expiry date rather than overwriting each other.
      expect(wholeDaysFromNow((await grantFields(parrain)).premiumGrantedUntil)).toBe(
        status.rewardDaysEarned,
      );
    });
  });

  describe('reward on email verification — the filleul', () => {
    it('flags a pending -30% discount, and advertises the percentage in the plan catalog', async () => {
      const filleul = await referredBy(await referrerWithTier(null));
      expect((await grantFields(filleul)).pendingReferralDiscount).toBe(false);

      await verifyEmail(filleul).then((res) => expect(res.status).toBe(200));

      expect((await grantFields(filleul)).pendingReferralDiscount).toBe(true);
      const plans = (await authedRequest(app, filleul).get('/api/billing/plans').expect(200))
        .body as PlanCatalog;
      expect(plans.referralFilleulDiscountPercent).toBe(30);
    });

    it('gives the filleul no free days — their reward is the discount only', async () => {
      const filleul = await referredBy(await referrerWithTier(null));
      await verifyEmail(filleul).then((res) => expect(res.status).toBe(200));

      expect((await grantFields(filleul)).premiumGrantedUntil).toBeNull();
      expect((await billingStatus(filleul)).hasPremiumAccess).toBe(false);
    });

    it('applies the coupon straight to a filleul who already has a live subscription, instead of flagging it', async () => {
      const filleul = await referredBy(await referrerWithTier(null));
      await prisma.company.update({
        where: { id: filleul.companyId },
        data: {
          stripeSubscriptionId: `sub_e2e_${filleul.companyId}`,
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          subscriptionPlanTier: PlanTier.ESSENTIEL,
        },
      });

      await verifyEmail(filleul).then((res) => expect(res.status).toBe(200));

      expect(applyCouponSpy).toHaveBeenCalledWith(
        `sub_e2e_${filleul.companyId}`,
        'coupon_e2e_referral',
      );
      expect((await grantFields(filleul)).pendingReferralDiscount).toBe(false);
    });

    it('still rewards the parrain when Stripe is not configured, but has no discount to give the filleul', async () => {
      stripeConfigured.mockReturnValue(false);
      const parrain = await referrerWithTier(null);
      const filleul = await referredBy(parrain);

      await verifyEmail(filleul).then((res) => expect(res.status).toBe(200));

      expect((await referralStatus(parrain)).rewardDaysEarned).toBe(10);
      expect((await grantFields(filleul)).pendingReferralDiscount).toBe(false);
    });
  });

  describe('the parrain’s reward on invoicing', () => {
    it('unlocks the GUIDED invoice the free quota had blocked, and locks it again when the grant lapses', async () => {
      const parrain = await referrerWithTier(null);
      await authedRequest(app, parrain).post('/api/invoices').send(guidedBody).expect(201);
      await authedRequest(app, parrain).post('/api/invoices').send(guidedBody).expect(402);

      // A filleul who signs up but hasn't verified changes nothing.
      const filleul = await referredBy(parrain);
      await authedRequest(app, parrain).post('/api/invoices').send(guidedBody).expect(402);

      await verifyEmail(filleul).then((res) => expect(res.status).toBe(200));
      await authedRequest(app, parrain).post('/api/invoices').send(guidedBody).expect(201);

      await prisma.company.update({
        where: { id: parrain.companyId },
        data: { premiumGrantedUntil: new Date(Date.now() - 1000) },
      });
      expect((await billingStatus(parrain)).hasPremiumAccess).toBe(false);
      await authedRequest(app, parrain).post('/api/invoices').send(guidedBody).expect(402);
    });
  });

  describe('the filleul’s discount at checkout', () => {
    async function verifiedFilleul(): Promise<TestSession> {
      const filleul = await referredBy(await referrerWithTier(null));
      await verifyEmail(filleul).then((res) => expect(res.status).toBe(200));
      return filleul;
    }

    async function checkout(session: TestSession, tier: PlanTier): Promise<void> {
      const response = await authedRequest(app, session)
        .post('/api/billing/checkout-session')
        .send({ tier })
        .expect(201);
      expect((response.body as { url: string }).url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    }

    it.each([PlanTier.ESSENTIEL, PlanTier.PRO, PlanTier.PREMIUM])(
      'puts the referral coupon on a %s Checkout Session, whichever tier is chosen',
      async (tier) => {
        const filleul = await verifiedFilleul();

        await checkout(filleul, tier);

        expect(createCheckoutSessionSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            tier,
            companyId: filleul.companyId,
            discountCouponId: 'coupon_e2e_referral',
          }),
        );
      },
    );

    it('puts no coupon on the Checkout Session of a filleul whose email is still unverified', async () => {
      const filleul = await referredBy(await referrerWithTier(null));

      await checkout(filleul, PlanTier.PRO);

      expect(createCheckoutSessionSpy).toHaveBeenCalledWith(
        expect.objectContaining({ discountCouponId: undefined }),
      );
    });

    it('beats the sitewide launch offer on Premium', async () => {
      launchOfferActive.mockReturnValue(true);
      const filleul = await verifiedFilleul();

      await checkout(filleul, PlanTier.PREMIUM);

      expect(createCheckoutSessionSpy).toHaveBeenCalledWith(
        expect.objectContaining({ discountCouponId: 'coupon_e2e_referral' }),
      );
    });

    it('yields to the 2 € trial offer on Premium when that is the cheaper of the two (2 € vs 15 € −30 %)', async () => {
      const filleul = await verifiedFilleul();
      // The first invoice opens the 48h trial offer.
      await authedRequest(app, filleul).post('/api/invoices').send(guidedBody).expect(201);
      expect((await billingStatus(filleul)).trialOffer).not.toBeNull();

      await checkout(filleul, PlanTier.PREMIUM);

      expect(createCheckoutSessionSpy).toHaveBeenCalledWith(
        expect.objectContaining({ tier: PlanTier.PREMIUM, discountCouponId: 'coupon_e2e_trial' }),
      );
    });

    it('keeps the referral coupon on a non-Premium tier even while the trial offer is running', async () => {
      const filleul = await verifiedFilleul();
      await authedRequest(app, filleul).post('/api/invoices').send(guidedBody).expect(201);

      await checkout(filleul, PlanTier.PRO);

      expect(createCheckoutSessionSpy).toHaveBeenCalledWith(
        expect.objectContaining({ tier: PlanTier.PRO, discountCouponId: 'coupon_e2e_referral' }),
      );
    });
  });
});
