import { PlanTier, SubscriptionStatus } from '../../generated/prisma/enums';
import { BillingFields, BillingRepository } from './billing.repository';
import { CatalogLimitExceededException } from './catalog-limit-exceeded.exception';
import { FacturXQuotaExceededException } from './facturx-quota-exceeded.exception';
import { PlanFeatureLockedException } from './plan-feature-locked.exception';
import { PlanGateService, isTrialOfferActive } from './plan-gate.service';
import { PremiumRequiredException } from './premium-required.exception';

function buildService(options: {
  invoiceCount?: number;
  customerCount?: number;
  catalogItemCount?: number;
  facturXUsedAt?: Date | null;
  facturXUsedThisMonth?: number;
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
  const getInvoiceFacturXUsedAt = jest.fn().mockResolvedValue(options.facturXUsedAt ?? null);
  const markInvoiceFacturXUsed = jest.fn().mockResolvedValue(undefined);
  const countFacturXUsedThisMonth = jest.fn().mockResolvedValue(options.facturXUsedThisMonth ?? 0);
  const repository = {
    getBillingFields,
    countInvoices,
    countCustomers,
    countCatalogItems,
    startTrialOfferWindow,
    getInvoiceFacturXUsedAt,
    markInvoiceFacturXUsed,
    countFacturXUsedThisMonth,
  } as unknown as BillingRepository;
  return {
    service: new PlanGateService(repository),
    getBillingFields,
    countInvoices,
    startTrialOfferWindow,
    getInvoiceFacturXUsedAt,
    markInvoiceFacturXUsed,
    countFacturXUsedThisMonth,
  };
}

describe('PlanGateService.assertCanCreateInvoice', () => {
  it('allows MANUAL unconditionally, regardless of invoice count or subscription', async () => {
    const { service, getBillingFields, countInvoices } = buildService({
      invoiceCount: 5,
      fields: {},
    });
    await expect(service.assertCanCreateInvoice('company-1', 'MANUAL')).resolves.toBeUndefined();
    // Short-circuits before even reading billing fields or the invoice count.
    expect(getBillingFields).not.toHaveBeenCalled();
    expect(countInvoices).not.toHaveBeenCalled();
  });

  it('allows GUIDED with zero GUIDED invoices regardless of subscription status', async () => {
    const { service } = buildService({ invoiceCount: 0, fields: {} });
    await expect(service.assertCanCreateInvoice('company-1', 'GUIDED')).resolves.toBeUndefined();
  });

  it('blocks GUIDED past its first free invoice with no subscription or grant', async () => {
    const { service } = buildService({ invoiceCount: 1, fields: {} });
    await expect(service.assertCanCreateInvoice('company-1', 'GUIDED')).rejects.toBeInstanceOf(
      PremiumRequiredException,
    );
  });

  it('allows GUIDED past its first invoice with an ACTIVE Essentiel subscription', async () => {
    const { service } = buildService({
      invoiceCount: 5,
      fields: {
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionPlanTier: PlanTier.ESSENTIEL,
      },
    });
    await expect(service.assertCanCreateInvoice('company-1', 'GUIDED')).resolves.toBeUndefined();
  });

  it('blocks GUIDED when the subscription is PAST_DUE or CANCELED', async () => {
    const { service } = buildService({
      invoiceCount: 2,
      fields: {
        subscriptionStatus: SubscriptionStatus.PAST_DUE,
        subscriptionPlanTier: PlanTier.PREMIUM,
      },
    });
    await expect(service.assertCanCreateInvoice('company-1', 'GUIDED')).rejects.toBeInstanceOf(
      PremiumRequiredException,
    );
  });

  it('allows GUIDED with a still-valid grant (promo code / admin / referral)', async () => {
    const future = new Date(Date.now() + 60_000);
    const { service } = buildService({
      invoiceCount: 3,
      fields: { premiumGrantedUntil: future, grantedPlanTier: PlanTier.ESSENTIEL },
    });
    await expect(service.assertCanCreateInvoice('company-1', 'GUIDED')).resolves.toBeUndefined();
  });

  it('blocks GUIDED when the grant has already expired', async () => {
    const past = new Date(Date.now() - 60_000);
    const { service } = buildService({
      invoiceCount: 3,
      fields: { premiumGrantedUntil: past, grantedPlanTier: PlanTier.PREMIUM },
    });
    await expect(service.assertCanCreateInvoice('company-1', 'GUIDED')).rejects.toBeInstanceOf(
      PremiumRequiredException,
    );
  });

  it('blocks QUICK_ACTION with no active plan even with zero invoices', async () => {
    const { service } = buildService({ invoiceCount: 0, fields: {} });
    await expect(
      service.assertCanCreateInvoice('company-1', 'QUICK_ACTION'),
    ).rejects.toBeInstanceOf(PremiumRequiredException);
  });

  it('allows QUICK_ACTION with an active plan', async () => {
    const { service } = buildService({
      invoiceCount: 0,
      fields: {
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionPlanTier: PlanTier.ESSENTIEL,
      },
    });
    await expect(
      service.assertCanCreateInvoice('company-1', 'QUICK_ACTION'),
    ).resolves.toBeUndefined();
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

describe('PlanGateService.assertCanUseFacturX / canUseFacturX', () => {
  it('allows a free-tier company under the monthly limit', async () => {
    const { service } = buildService({ facturXUsedThisMonth: 4, fields: {} });
    await expect(service.canUseFacturX('company-1', 'inv-1')).resolves.toBe(true);
  });

  it('blocks a free-tier company that already hit the monthly limit', async () => {
    const { service } = buildService({ facturXUsedThisMonth: 5, fields: {} });
    await expect(service.canUseFacturX('company-1', 'inv-1')).resolves.toBe(false);
    await expect(service.assertCanUseFacturX('company-1', 'inv-1')).rejects.toBeInstanceOf(
      FacturXQuotaExceededException,
    );
  });

  it('is unlimited for a company with an active plan, regardless of usage this month', async () => {
    const { service } = buildService({
      facturXUsedThisMonth: 99,
      fields: {
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionPlanTier: PlanTier.ESSENTIEL,
      },
    });
    await expect(service.canUseFacturX('company-1', 'inv-1')).resolves.toBe(true);
  });

  it('is always free to re-access an invoice whose slot was already spent, even over the limit', async () => {
    const { service, getBillingFields, countInvoices } = buildService({
      facturXUsedAt: new Date(),
      facturXUsedThisMonth: 99,
      fields: {},
    });
    await expect(service.canUseFacturX('company-1', 'inv-1')).resolves.toBe(true);
    // Short-circuits before even checking the plan or the monthly count.
    expect(getBillingFields).not.toHaveBeenCalled();
    expect(countInvoices).not.toHaveBeenCalled();
  });
});

describe('PlanGateService.recordFacturXUsed', () => {
  it('delegates to the repository’s idempotent conditional update', async () => {
    const { service, markInvoiceFacturXUsed } = buildService({ fields: {} });
    await service.recordFacturXUsed('company-1', 'inv-1');
    expect(markInvoiceFacturXUsed).toHaveBeenCalledWith('company-1', 'inv-1');
  });
});
