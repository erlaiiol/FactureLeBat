import { Injectable } from '@nestjs/common';
import { SubscriptionStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../database/prisma.service';

export interface BillingFields {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  premiumGrantedUntil: Date | null;
}

const BILLING_FIELDS_SELECT = {
  stripeCustomerId: true,
  stripeSubscriptionId: true,
  subscriptionStatus: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
  premiumGrantedUntil: true,
} as const;

@Injectable()
export class BillingRepository {
  constructor(private readonly prisma: PrismaService) {}

  getBillingFields(companyId: string): Promise<BillingFields> {
    return this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: BILLING_FIELDS_SELECT,
    });
  }

  // How many invoices this company has ever created — the free-trial gate
  // is "0 invoices so far", not a persisted counter, same "derived data is
  // never persisted" convention as the rest of this app (see
  // docs/roadmap.md's Phase 5/7/8.5 implementation notes). Cheap: an
  // indexed count on Invoice.companyId.
  countInvoices(companyId: string): Promise<number> {
    return this.prisma.invoice.count({ where: { companyId } });
  }

  setStripeCustomerId(companyId: string, stripeCustomerId: string): Promise<void> {
    return this.prisma.company
      .update({ where: { id: companyId }, data: { stripeCustomerId } })
      .then(() => undefined);
  }

  findCompanyIdByStripeCustomerId(stripeCustomerId: string): Promise<string | null> {
    return this.prisma.company
      .findUnique({ where: { stripeCustomerId }, select: { id: true } })
      .then((row) => row?.id ?? null);
  }

  // Written exclusively from a verified Stripe webhook event (see
  // BillingService.applySubscriptionEvent) — never from the checkout
  // redirect, which only proves the artisan reached Stripe, not that the
  // subscription actually activated.
  applySubscriptionUpdate(
    companyId: string,
    data: {
      stripeSubscriptionId: string;
      subscriptionStatus: SubscriptionStatus;
      currentPeriodEnd: Date | null;
      cancelAtPeriodEnd: boolean;
    },
  ): Promise<void> {
    return this.prisma.company.update({ where: { id: companyId }, data }).then(() => undefined);
  }

  // Extends from whichever is later — the current grant (if still running)
  // or now — so redeeming a second code/grant while one is already active
  // stacks on top of it instead of resetting the clock backward.
  async grantPremiumDays(companyId: string, days: number): Promise<Date> {
    const { premiumGrantedUntil } = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { premiumGrantedUntil: true },
    });
    const now = new Date();
    const base = premiumGrantedUntil && premiumGrantedUntil > now ? premiumGrantedUntil : now;
    const newUntil = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    await this.prisma.company.update({
      where: { id: companyId },
      data: { premiumGrantedUntil: newUntil },
    });
    return newUntil;
  }
}
