import { PlanTier, SubscriptionStatus } from '../../generated/prisma/enums';
import { BillingFields, BillingRepository } from './billing.repository';
import { CatalogLimitExceededException } from './catalog-limit-exceeded.exception';
import { PlanFeatureLockedException } from './plan-feature-locked.exception';
import { PlanGateService, isTrialOfferActive } from './plan-gate.service';
import { PremiumRequiredException } from './premium-required.exception';

function buildService(options: {
  invoiceCount?: number;
  customerCount?: number;
  catalogItemCount?: number;
  fields: Partial<BillingFields>;
}) {
  const fields: BillingFields = {
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
    ...options.fields,
  };
  const getBillingFields = jest.fn().mockResolvedValue(fields);
  const countInvoices = jest.fn().mockResolvedValue(options.invoiceCount ?? 0);
  const countCustomers = jest.fn().mockResolvedValue(options.customerCount ?? 0);
  const countCatalogItems = jest.fn().mockResolvedValue(options.catalogItemCount ?? 0);
  const startTrialOfferWindow = jest.fn().mockResolvedValue(undefined);
  const repository = {
    getBillingFields,
    countInvoices,
    countCustomers,
    countCatalogItems,
    startTrialOfferWindow,
  } as unknown as BillingRepository;
  return {
    service: new PlanGateService(repository),
    getBillingFields,
    countInvoices,
    startTrialOfferWindow,
  };
}

describe('PlanGateService.assertCanCreateInvoice', () => {
  it('allows a company with zero invoices regardless of subscription status', async () => {
    const { service } = buildService({ invoiceCount: 0, fields: {} });
    await expect(service.assertCanCreateInvoice('company-1')).resolves.toBeUndefined();
  });

  it('blocks a company past its first invoice with no subscription or grant', async () => {
    const { service } = buildService({ invoiceCount: 1, fields: {} });
    await expect(service.assertCanCreateInvoice('company-1')).rejects.toBeInstanceOf(
      PremiumRequiredException,
    );
  });

  it('allows a company past its first invoice with an ACTIVE Essentiel subscription', async () => {
    const { service } = buildService({
      invoiceCount: 5,
      fields: {
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionPlanTier: PlanTier.ESSENTIEL,
      },
    });
    await expect(service.assertCanCreateInvoice('company-1')).resolves.toBeUndefined();
  });

  it('blocks a company whose subscription is PAST_DUE or CANCELED', async () => {
    const { service } = buildService({
      invoiceCount: 2,
      fields: {
        subscriptionStatus: SubscriptionStatus.PAST_DUE,
        subscriptionPlanTier: PlanTier.PREMIUM,
      },
    });
    await expect(service.assertCanCreateInvoice('company-1')).rejects.toBeInstanceOf(
      PremiumRequiredException,
    );
  });

  it('allows a company with a still-valid grant (promo code / admin / referral)', async () => {
    const future = new Date(Date.now() + 60_000);
    const { service } = buildService({
      invoiceCount: 3,
      fields: { premiumGrantedUntil: future, grantedPlanTier: PlanTier.ESSENTIEL },
    });
    await expect(service.assertCanCreateInvoice('company-1')).resolves.toBeUndefined();
  });

  it('blocks a company whose grant has already expired', async () => {
    const past = new Date(Date.now() - 60_000);
    const { service } = buildService({
      invoiceCount: 3,
      fields: { premiumGrantedUntil: past, grantedPlanTier: PlanTier.PREMIUM },
    });
    await expect(service.assertCanCreateInvoice('company-1')).rejects.toBeInstanceOf(
      PremiumRequiredException,
    );
  });
});

describe('PlanGateService.assertCatalogCapacity', () => {
  it('treats a company with no active plan as Essentiel (cap 20 customers)', async () => {
    const { service } = buildService({ customerCount: 20, fields: {} });
    await expect(service.assertCatalogCapacity('company-1', 'customer')).rejects.toBeInstanceOf(
      CatalogLimitExceededException,
    );
  });

  it('allows a customer under the Essentiel cap', async () => {
    const { service } = buildService({ customerCount: 19, fields: {} });
    await expect(service.assertCatalogCapacity('company-1', 'customer')).resolves.toBeUndefined();
  });

  it('Pro raises the cap to 150', async () => {
    const { service } = buildService({
      customerCount: 100,
      fields: {
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionPlanTier: PlanTier.PRO,
      },
    });
    await expect(service.assertCatalogCapacity('company-1', 'customer')).resolves.toBeUndefined();
  });

  it('Premium has no cap at all', async () => {
    const { service } = buildService({
      customerCount: 10_000,
      fields: {
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionPlanTier: PlanTier.PREMIUM,
      },
    });
    await expect(service.assertCatalogCapacity('company-1', 'customer')).resolves.toBeUndefined();
  });
});

describe('PlanGateService.assertFeatureAccess', () => {
  it('blocks analytics for Essentiel', async () => {
    const { service } = buildService({
      fields: {
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionPlanTier: PlanTier.ESSENTIEL,
      },
    });
    await expect(service.assertFeatureAccess('company-1', 'analytics')).rejects.toBeInstanceOf(
      PlanFeatureLockedException,
    );
  });

  it('allows analytics for Pro', async () => {
    const { service } = buildService({
      fields: { subscriptionStatus: SubscriptionStatus.ACTIVE, subscriptionPlanTier: PlanTier.PRO },
    });
    await expect(service.assertFeatureAccess('company-1', 'analytics')).resolves.toBeUndefined();
  });

  it('blocks the AI assistant for Pro (Premium-only)', async () => {
    const { service } = buildService({
      fields: { subscriptionStatus: SubscriptionStatus.ACTIVE, subscriptionPlanTier: PlanTier.PRO },
    });
    await expect(service.assertFeatureAccess('company-1', 'aiSourcing')).rejects.toBeInstanceOf(
      PlanFeatureLockedException,
    );
  });

  it('allows the AI assistant for Premium', async () => {
    const { service } = buildService({
      fields: {
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionPlanTier: PlanTier.PREMIUM,
      },
    });
    await expect(service.assertFeatureAccess('company-1', 'aiSourcing')).resolves.toBeUndefined();
  });

  it('blocks a company with no active plan at all', async () => {
    const { service } = buildService({ fields: {} });
    await expect(service.assertFeatureAccess('company-1', 'analytics')).rejects.toBeInstanceOf(
      PlanFeatureLockedException,
    );
  });
});

describe('PlanGateService.recordInvoiceCreated', () => {
  it('starts the trial-offer window on a company’s very first invoice', async () => {
    const { service, startTrialOfferWindow } = buildService({ invoiceCount: 1, fields: {} });
    await service.recordInvoiceCreated('company-1');
    expect(startTrialOfferWindow).toHaveBeenCalledWith('company-1', 48);
  });

  it('does nothing once the company already has more than one invoice', async () => {
    const { service, startTrialOfferWindow } = buildService({ invoiceCount: 2, fields: {} });
    await service.recordInvoiceCreated('company-1');
    expect(startTrialOfferWindow).not.toHaveBeenCalled();
  });

  it('does nothing for a company that already has an active plan', async () => {
    const { service, startTrialOfferWindow } = buildService({
      invoiceCount: 1,
      fields: { subscriptionStatus: SubscriptionStatus.ACTIVE, subscriptionPlanTier: PlanTier.PRO },
    });
    await service.recordInvoiceCreated('company-1');
    expect(startTrialOfferWindow).not.toHaveBeenCalled();
  });
});

describe('isTrialOfferActive', () => {
  const base = {
    subscriptionStatus: SubscriptionStatus.NONE,
    subscriptionPlanTier: null,
    premiumGrantedUntil: null,
    grantedPlanTier: null,
  };

  it('is true while the deadline is in the future and no plan is active', () => {
    const future = new Date(Date.now() + 60_000);
    expect(isTrialOfferActive({ ...base, trialOfferExpiresAt: future })).toBe(true);
  });

  it('is false once the deadline has passed', () => {
    const past = new Date(Date.now() - 60_000);
    expect(isTrialOfferActive({ ...base, trialOfferExpiresAt: past })).toBe(false);
  });

  it('is false when no window was ever started', () => {
    expect(isTrialOfferActive({ ...base, trialOfferExpiresAt: null })).toBe(false);
  });

  it('is false once the company has converted, even if the deadline is still in the future', () => {
    const future = new Date(Date.now() + 60_000);
    expect(
      isTrialOfferActive({
        ...base,
        trialOfferExpiresAt: future,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionPlanTier: PlanTier.PREMIUM,
      }),
    ).toBe(false);
  });
});
