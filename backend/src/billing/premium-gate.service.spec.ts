import { SubscriptionStatus } from '../../generated/prisma/enums';
import { BillingFields, BillingRepository } from './billing.repository';
import { PremiumGateService } from './premium-gate.service';
import { PremiumRequiredException } from './premium-required.exception';

function buildService(options: { invoiceCount: number; fields: Partial<BillingFields> }) {
  const fields: BillingFields = {
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionStatus: SubscriptionStatus.NONE,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    premiumGrantedUntil: null,
    ...options.fields,
  };
  const getBillingFields = jest.fn().mockResolvedValue(fields);
  const countInvoices = jest.fn().mockResolvedValue(options.invoiceCount);
  const repository = { getBillingFields, countInvoices } as unknown as BillingRepository;
  return { service: new PremiumGateService(repository), getBillingFields, countInvoices };
}

describe('PremiumGateService.assertCanCreateInvoice', () => {
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

  it('allows a company past its first invoice with an ACTIVE subscription', async () => {
    const { service } = buildService({
      invoiceCount: 5,
      fields: { subscriptionStatus: SubscriptionStatus.ACTIVE },
    });
    await expect(service.assertCanCreateInvoice('company-1')).resolves.toBeUndefined();
  });

  it('blocks a company whose subscription is PAST_DUE or CANCELED', async () => {
    const { service } = buildService({
      invoiceCount: 2,
      fields: { subscriptionStatus: SubscriptionStatus.PAST_DUE },
    });
    await expect(service.assertCanCreateInvoice('company-1')).rejects.toBeInstanceOf(
      PremiumRequiredException,
    );
  });

  it('allows a company with a still-valid premiumGrantedUntil (promo code / admin grant)', async () => {
    const future = new Date(Date.now() + 60_000);
    const { service } = buildService({ invoiceCount: 3, fields: { premiumGrantedUntil: future } });
    await expect(service.assertCanCreateInvoice('company-1')).resolves.toBeUndefined();
  });

  it('blocks a company whose premiumGrantedUntil has already passed', async () => {
    const past = new Date(Date.now() - 60_000);
    const { service } = buildService({ invoiceCount: 3, fields: { premiumGrantedUntil: past } });
    await expect(service.assertCanCreateInvoice('company-1')).rejects.toBeInstanceOf(
      PremiumRequiredException,
    );
  });
});
