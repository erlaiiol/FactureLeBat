import { SubscriptionStatus } from '../../generated/prisma/enums';
import { BillingFields, BillingRepository } from './billing.repository';
import { BillingService } from './billing.service';
import { StripeClientService } from './stripe/stripe-client.service';

function billingFields(overrides: Partial<BillingFields> = {}): BillingFields {
  return {
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionStatus: SubscriptionStatus.NONE,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    premiumGrantedUntil: null,
    pendingReferralDiscount: false,
    ...overrides,
  };
}

function buildService(options: { fields?: BillingFields; stripeConfigured?: boolean } = {}) {
  const getBillingFields = jest.fn().mockResolvedValue(options.fields ?? billingFields());
  const setPendingReferralDiscount = jest.fn().mockResolvedValue(undefined);
  const setStripeCustomerId = jest.fn().mockResolvedValue(undefined);
  const repository = {
    getBillingFields,
    setPendingReferralDiscount,
    setStripeCustomerId,
    countInvoices: jest.fn().mockResolvedValue(0),
  } as unknown as BillingRepository;

  const isConfigured = jest.fn().mockReturnValue(options.stripeConfigured ?? true);
  const ensureReferralDiscountCoupon = jest.fn().mockResolvedValue('referral-filleul-5eur-1mois');
  const applyCouponToSubscription = jest.fn().mockResolvedValue(undefined);
  const createCheckoutSession = jest
    .fn()
    .mockResolvedValue({ url: 'https://checkout.stripe.com/session' });
  const stripeClient = {
    isConfigured,
    ensureReferralDiscountCoupon,
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
      }),
    });
    await service.grantReferralDiscount(COMPANY_ID);
    expect(applyCouponToSubscription).toHaveBeenCalledWith(
      'sub_123',
      'referral-filleul-5eur-1mois',
    );
    expect(setPendingReferralDiscount).not.toHaveBeenCalled();
  });

  it('applies the coupon directly for a PAST_DUE subscription too (still live, just failing payment)', async () => {
    const { service, applyCouponToSubscription } = buildService({
      fields: billingFields({
        stripeSubscriptionId: 'sub_456',
        subscriptionStatus: SubscriptionStatus.PAST_DUE,
      }),
    });
    await service.grantReferralDiscount(COMPANY_ID);
    expect(applyCouponToSubscription).toHaveBeenCalledWith(
      'sub_456',
      'referral-filleul-5eur-1mois',
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

describe('BillingService.createCheckoutSession — referral discount pickup', () => {
  it('attaches the referral coupon when pendingReferralDiscount is set', async () => {
    const { service, createCheckoutSession } = buildService({
      fields: billingFields({ stripeCustomerId: 'cus_1', pendingReferralDiscount: true }),
    });
    await service.createCheckoutSession('company-1', 'artisan@example.com');
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ discountCouponId: 'referral-filleul-5eur-1mois' }),
    );
  });

  it('never attaches a coupon when no discount is pending', async () => {
    const { service, createCheckoutSession } = buildService({
      fields: billingFields({ stripeCustomerId: 'cus_1', pendingReferralDiscount: false }),
    });
    await service.createCheckoutSession('company-1', 'artisan@example.com');
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ discountCouponId: undefined }),
    );
  });
});
