import { NotificationTypeV2, Status } from '@apple/app-store-server-library';
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
    appleOriginalTransactionId: null,
    appleSubscriptionStatus: SubscriptionStatus.NONE,
    appleSubscriptionPlanTier: null,
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
  const applyAppleSubscriptionUpdate = jest.fn().mockResolvedValue(undefined);
  const findCompanyIdByAppleOriginalTransactionId = jest.fn().mockResolvedValue(null);
  const repository = {
    getBillingFields,
    setPendingReferralDiscount,
    setStripeCustomerId,
    countInvoices: jest.fn().mockResolvedValue(0),
    countCustomers: jest.fn().mockResolvedValue(0),
    countCatalogItems: jest.fn().mockResolvedValue(0),
    countFacturXUsedThisMonth: jest.fn().mockResolvedValue(0),
    applyAppleSubscriptionUpdate,
    findCompanyIdByAppleOriginalTransactionId,
  } as unknown as BillingRepository;

  const verifyTransaction = jest.fn();
  const verifyNotification = jest.fn();
  const resolveTierFromProductId = jest.fn().mockReturnValue(null);
  const appleClient = {
    isConfigured: jest.fn().mockReturnValue(false),
    verifyTransaction,
    verifyNotification,
    resolveTierFromProductId,
  } as unknown as import('./apple/apple-server-client.service').AppleServerClientService;

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
    service: new BillingService(repository, stripeClient, appleClient, {
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
    applyAppleSubscriptionUpdate,
    findCompanyIdByAppleOriginalTransactionId,
    verifyTransaction,
    verifyNotification,
    resolveTierFromProductId,
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

describe('BillingService.verifyApplePurchase', () => {
  it('links the verified originalTransactionId to the calling company and resolves the tier from productId', async () => {
    const { service, verifyTransaction, resolveTierFromProductId, applyAppleSubscriptionUpdate } =
      buildService({});
    verifyTransaction.mockResolvedValue({
      originalTransactionId: 'apple-orig-1',
      productId: 'fr.facturele.app.subscription.pro',
      expiresDate: Date.now() + 60_000,
    });
    resolveTierFromProductId.mockReturnValue(PlanTier.PRO);

    const result = await service.verifyApplePurchase('company-1', 'signed-jws');

    expect(result).toEqual({ tier: PlanTier.PRO });
    expect(applyAppleSubscriptionUpdate).toHaveBeenCalledWith('company-1', {
      appleOriginalTransactionId: 'apple-orig-1',
      appleSubscriptionStatus: SubscriptionStatus.ACTIVE,
      appleSubscriptionPlanTier: PlanTier.PRO,
    });
  });

  it('marks the subscription CANCELED rather than ACTIVE when the verified transaction is already revoked (e.g. a stale/replayed JWS)', async () => {
    const { service, verifyTransaction, resolveTierFromProductId, applyAppleSubscriptionUpdate } =
      buildService({});
    verifyTransaction.mockResolvedValue({
      originalTransactionId: 'apple-orig-2',
      productId: 'fr.facturele.app.subscription.premium',
      revocationDate: Date.now() - 1000,
    });
    resolveTierFromProductId.mockReturnValue(PlanTier.PREMIUM);

    await service.verifyApplePurchase('company-1', 'signed-jws');

    expect(applyAppleSubscriptionUpdate).toHaveBeenCalledWith(
      'company-1',
      expect.objectContaining({ appleSubscriptionStatus: SubscriptionStatus.CANCELED }),
    );
  });

  it('still links the transaction (with a null tier) when the product id matches no configured tier, rather than guessing', async () => {
    const { service, verifyTransaction, resolveTierFromProductId, applyAppleSubscriptionUpdate } =
      buildService({});
    verifyTransaction.mockResolvedValue({
      originalTransactionId: 'apple-orig-3',
      productId: 'some.unconfigured.product',
    });
    resolveTierFromProductId.mockReturnValue(null);

    const result = await service.verifyApplePurchase('company-1', 'signed-jws');

    expect(result).toEqual({ tier: null });
    expect(applyAppleSubscriptionUpdate).toHaveBeenCalledWith(
      'company-1',
      expect.objectContaining({ appleSubscriptionPlanTier: null }),
    );
  });

  it('throws when the verified transaction is missing originalTransactionId', async () => {
    const { service, verifyTransaction } = buildService({});
    verifyTransaction.mockResolvedValue({ productId: 'fr.facturele.app.subscription.pro' });
    await expect(service.verifyApplePurchase('company-1', 'signed-jws')).rejects.toThrow(
      'originalTransactionId',
    );
  });
});

describe('BillingService.handleAppleNotification', () => {
  it('resolves the company by originalTransactionId and applies the mapped status/tier', async () => {
    const {
      service,
      verifyNotification,
      verifyTransaction,
      resolveTierFromProductId,
      findCompanyIdByAppleOriginalTransactionId,
      applyAppleSubscriptionUpdate,
    } = buildService({});
    verifyNotification.mockResolvedValue({
      notificationType: NotificationTypeV2.DID_RENEW,
      data: { signedTransactionInfo: 'signed-transaction', status: Status.ACTIVE },
    });
    verifyTransaction.mockResolvedValue({
      originalTransactionId: 'apple-orig-1',
      productId: 'fr.facturele.app.subscription.pro',
    });
    resolveTierFromProductId.mockReturnValue(PlanTier.PRO);
    findCompanyIdByAppleOriginalTransactionId.mockResolvedValue('company-1');

    await service.handleAppleNotification('signed-payload');

    expect(findCompanyIdByAppleOriginalTransactionId).toHaveBeenCalledWith('apple-orig-1');
    expect(applyAppleSubscriptionUpdate).toHaveBeenCalledWith('company-1', {
      appleOriginalTransactionId: 'apple-orig-1',
      appleSubscriptionStatus: SubscriptionStatus.ACTIVE,
      appleSubscriptionPlanTier: PlanTier.PRO,
    });
  });

  it('maps an EXPIRED notification down to CANCELED', async () => {
    const {
      service,
      verifyNotification,
      verifyTransaction,
      findCompanyIdByAppleOriginalTransactionId,
      applyAppleSubscriptionUpdate,
    } = buildService({});
    verifyNotification.mockResolvedValue({
      notificationType: NotificationTypeV2.EXPIRED,
      data: { signedTransactionInfo: 'signed-transaction', status: Status.EXPIRED },
    });
    verifyTransaction.mockResolvedValue({
      originalTransactionId: 'apple-orig-1',
      productId: 'fr.facturele.app.subscription.pro',
    });
    findCompanyIdByAppleOriginalTransactionId.mockResolvedValue('company-1');

    await service.handleAppleNotification('signed-payload');

    expect(applyAppleSubscriptionUpdate).toHaveBeenCalledWith(
      'company-1',
      expect.objectContaining({ appleSubscriptionStatus: SubscriptionStatus.CANCELED }),
    );
  });

  it('does nothing for a TEST notification ping', async () => {
    const { service, verifyNotification, verifyTransaction, applyAppleSubscriptionUpdate } =
      buildService({});
    verifyNotification.mockResolvedValue({ notificationType: NotificationTypeV2.TEST });

    await service.handleAppleNotification('signed-payload');

    expect(verifyTransaction).not.toHaveBeenCalled();
    expect(applyAppleSubscriptionUpdate).not.toHaveBeenCalled();
  });

  it('does nothing when no company has ever verified a purchase for that originalTransactionId', async () => {
    const {
      service,
      verifyNotification,
      verifyTransaction,
      findCompanyIdByAppleOriginalTransactionId,
      applyAppleSubscriptionUpdate,
    } = buildService({});
    verifyNotification.mockResolvedValue({
      notificationType: NotificationTypeV2.SUBSCRIBED,
      data: { signedTransactionInfo: 'signed-transaction', status: Status.ACTIVE },
    });
    verifyTransaction.mockResolvedValue({
      originalTransactionId: 'unknown-orig',
      productId: 'fr.facturele.app.subscription.pro',
    });
    findCompanyIdByAppleOriginalTransactionId.mockResolvedValue(null);

    await service.handleAppleNotification('signed-payload');

    expect(applyAppleSubscriptionUpdate).not.toHaveBeenCalled();
  });
});
