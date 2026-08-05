import { PlanTier, SubscriptionStatus } from '../../generated/prisma/enums';
import { BillingFields, BillingRepository } from './billing.repository';
import { BillingService } from './billing.service';
import { StripeClientService } from './stripe/stripe-client.service';

function billingFields(overrides: Partial<BillingFields> = {}): BillingFields {
  return {
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionStatus: SubscriptionStatus.NONE,
    subscriptionPlanTier: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    premiumGrantedUntil: null,
    grantedPlanTier: null,
    pendingReferralDiscount: false,
    trialOfferExpiresAt: null,
    ...overrides,
  };
}

function buildService(
  options: { fields?: BillingFields; stripeConfigured?: boolean; launchOfferActive?: boolean } = {},
) {
  const getBillingFields = jest.fn().mockResolvedValue(options.fields ?? billingFields());
  const setPendingReferralDiscount = jest.fn().mockResolvedValue(undefined);
  const setStripeCustomerId = jest.fn().mockResolvedValue(undefined);
  const repository = {
    getBillingFields,
    setPendingReferralDiscount,
    setStripeCustomerId,
    countInvoices: jest.fn().mockResolvedValue(0),
    countCustomers: jest.fn().mockResolvedValue(0),
    countCatalogItems: jest.fn().mockResolvedValue(0),
  } as unknown as BillingRepository;

  const isConfigured = jest.fn().mockReturnValue(options.stripeConfigured ?? true);
  const ensureReferralDiscountCoupon = jest.fn().mockResolvedValue('referral-filleul-30pct-1mois');
  const ensureLaunchOfferCoupon = jest.fn().mockResolvedValue('launch-offer-premium-2mois');
  const ensureTrialOfferCoupon = jest.fn().mockResolvedValue('trial-offer-premium-1mois-2eur');
  const isLaunchOfferActive = jest.fn().mockReturnValue(options.launchOfferActive ?? false);
  const applyCouponToSubscription = jest.fn().mockResolvedValue(undefined);
  const createCheckoutSession = jest
    .fn()
    .mockResolvedValue({ url: 'https://checkout.stripe.com/session' });
  const stripeClient = {
    isConfigured,
    ensureReferralDiscountCoupon,
    ensureLaunchOfferCoupon,
    ensureTrialOfferCoupon,
    isLaunchOfferActive,
    applyCouponToSubscription,
    createCheckoutSession,
    createCustomer: jest.fn(),
  } as unknown as StripeClientService;

  return {
    service: new BillingService(repository, stripeClient, {
      get: () => 'http://localhost:4200',
    } as never),
    getBillingFields,
    setPendingReferralDiscount,
    ensureReferralDiscountCoupon,
    ensureLaunchOfferCoupon,
    ensureTrialOfferCoupon,
    applyCouponToSubscription,
    createCheckoutSession,
    isConfigured,
  };
}

describe('BillingService.grantReferralDiscount', () => {
  const COMPANY_ID = 'company-1';

  it('does nothing when Stripe is not configured on this deployment', async () => {
    const { service, getBillingFields, setPendingReferralDiscount } = buildService({
      stripeConfigured: false,
    });
    await service.grantReferralDiscount(COMPANY_ID);
    expect(getBillingFields).not.toHaveBeenCalled();
    expect(setPendingReferralDiscount).not.toHaveBeenCalled();
  });

  it('applies the coupon directly when the company already has a live (ACTIVE) subscription', async () => {
    const { service, applyCouponToSubscription, setPendingReferralDiscount } = buildService({
      fields: billingFields({
        stripeSubscriptionId: 'sub_123',
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionPlanTier: PlanTier.PRO,
      }),
    });
    await service.grantReferralDiscount(COMPANY_ID);
    expect(applyCouponToSubscription).toHaveBeenCalledWith(
      'sub_123',
      'referral-filleul-30pct-1mois',
    );
    expect(setPendingReferralDiscount).not.toHaveBeenCalled();
  });

  it('applies the coupon directly for a PAST_DUE subscription too (still live, just failing payment)', async () => {
    const { service, applyCouponToSubscription } = buildService({
      fields: billingFields({
        stripeSubscriptionId: 'sub_456',
        subscriptionStatus: SubscriptionStatus.PAST_DUE,
        subscriptionPlanTier: PlanTier.ESSENTIEL,
      }),
    });
    await service.grantReferralDiscount(COMPANY_ID);
    expect(applyCouponToSubscription).toHaveBeenCalledWith(
      'sub_456',
      'referral-filleul-30pct-1mois',
    );
  });

  it('flags the discount as pending when the company has no live subscription yet', async () => {
    const { service, applyCouponToSubscription, setPendingReferralDiscount } = buildService({
      fields: billingFields(),
    });
    await service.grantReferralDiscount(COMPANY_ID);
    expect(applyCouponToSubscription).not.toHaveBeenCalled();
    expect(setPendingReferralDiscount).toHaveBeenCalledWith(COMPANY_ID, true);
  });

  it('flags as pending rather than applying to a CANCELED subscription', async () => {
    const { service, applyCouponToSubscription, setPendingReferralDiscount } = buildService({
      fields: billingFields({
        stripeSubscriptionId: 'sub_old',
        subscriptionStatus: SubscriptionStatus.CANCELED,
      }),
    });
    await service.grantReferralDiscount(COMPANY_ID);
    expect(applyCouponToSubscription).not.toHaveBeenCalled();
    expect(setPendingReferralDiscount).toHaveBeenCalledWith(COMPANY_ID, true);
  });
});

describe('BillingService.createCheckoutSession — discount priority', () => {
  it("attaches the referral coupon when pendingReferralDiscount is set, even on Premium with an active launch offer (Phase 30's deliberate rule: a specific, earned reward always beats the generic promo, even though the launch offer is nominally 50 centimes cheaper — 10 € vs 10,50 €)", async () => {
    const { service, createCheckoutSession } = buildService({
      fields: billingFields({ stripeCustomerId: 'cus_1', pendingReferralDiscount: true }),
      launchOfferActive: true,
    });
    await service.createCheckoutSession('company-1', 'artisan@example.com', PlanTier.PREMIUM);
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ discountCouponId: 'referral-filleul-30pct-1mois' }),
    );
  });

  it('attaches the launch offer coupon on a Premium checkout with no pending referral discount', async () => {
    const { service, createCheckoutSession } = buildService({
      fields: billingFields({ stripeCustomerId: 'cus_1', pendingReferralDiscount: false }),
      launchOfferActive: true,
    });
    await service.createCheckoutSession('company-1', 'artisan@example.com', PlanTier.PREMIUM);
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ discountCouponId: 'launch-offer-premium-2mois' }),
    );
  });

  it('never attaches the launch offer coupon on a non-Premium checkout', async () => {
    const { service, createCheckoutSession } = buildService({
      fields: billingFields({ stripeCustomerId: 'cus_1', pendingReferralDiscount: false }),
      launchOfferActive: true,
    });
    await service.createCheckoutSession('company-1', 'artisan@example.com', PlanTier.PRO);
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ discountCouponId: undefined }),
    );
  });

  it('never attaches a coupon when no discount is pending and no launch offer is active', async () => {
    const { service, createCheckoutSession } = buildService({
      fields: billingFields({ stripeCustomerId: 'cus_1', pendingReferralDiscount: false }),
      launchOfferActive: false,
    });
    await service.createCheckoutSession('company-1', 'artisan@example.com', PlanTier.PREMIUM);
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ discountCouponId: undefined }),
    );
  });

  it('attaches the trial-offer coupon on Premium when the countdown is still running, even with the launch offer also active', async () => {
    const future = new Date(Date.now() + 60_000);
    const { service, createCheckoutSession } = buildService({
      fields: billingFields({
        stripeCustomerId: 'cus_1',
        pendingReferralDiscount: false,
        trialOfferExpiresAt: future,
      }),
      launchOfferActive: true,
    });
    await service.createCheckoutSession('company-1', 'artisan@example.com', PlanTier.PREMIUM);
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ discountCouponId: 'trial-offer-premium-1mois-2eur' }),
    );
  });

  it('never attaches the trial-offer coupon on a non-Premium checkout, even while the countdown is running', async () => {
    const future = new Date(Date.now() + 60_000);
    const { service, createCheckoutSession } = buildService({
      fields: billingFields({
        stripeCustomerId: 'cus_1',
        pendingReferralDiscount: false,
        trialOfferExpiresAt: future,
      }),
    });
    await service.createCheckoutSession('company-1', 'artisan@example.com', PlanTier.PRO);
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ discountCouponId: undefined }),
    );
  });

  it('when both are active, the cheaper trial-offer coupon wins over the referral discount on Premium (2 € vs 10,50 €) — a referred filleul must never pay more than a non-referred artisan in the same trial window', async () => {
    const future = new Date(Date.now() + 60_000);
    const { service, createCheckoutSession } = buildService({
      fields: billingFields({
        stripeCustomerId: 'cus_1',
        pendingReferralDiscount: true,
        trialOfferExpiresAt: future,
      }),
    });
    await service.createCheckoutSession('company-1', 'artisan@example.com', PlanTier.PREMIUM);
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ discountCouponId: 'trial-offer-premium-1mois-2eur' }),
    );
  });

  it('falls back to the launch offer once the trial-offer countdown has expired', async () => {
    const past = new Date(Date.now() - 60_000);
    const { service, createCheckoutSession } = buildService({
      fields: billingFields({
        stripeCustomerId: 'cus_1',
        pendingReferralDiscount: false,
        trialOfferExpiresAt: past,
      }),
      launchOfferActive: true,
    });
    await service.createCheckoutSession('company-1', 'artisan@example.com', PlanTier.PREMIUM);
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ discountCouponId: 'launch-offer-premium-2mois' }),
    );
  });
});
