import { Injectable } from '@nestjs/common';
import { SubscriptionStatus } from '../../generated/prisma/enums';
import { BillingFields, BillingRepository } from './billing.repository';
import { PremiumRequiredException } from './premium-required.exception';

// Phase 14's actual business rule, isolated from both the Stripe plumbing
// (StripeClientService) and the HTTP surface (BillingController): a company
// may always configure its environment (customers/products/services) and
// may always create its very first invoice for free — see
// docs/roadmap.md's "1 facture offerte, configuration illimitée" promise.
// Every invoice after that requires an active subscription or a live
// premium grant (Stripe or promo-code/admin-issued — the two are
// interchangeable here, see BillingRepository.grantPremiumDays).
//
// Deliberately called from InvoiceService.create()/previewPdf() (both —
// the artisan is blocked from even generating a look-but-don't-persist
// preview of a 2nd invoice, not just from the final "create"), and nowhere
// earlier in the flow: the roadmap's own "frustrate at the last moment"
// instruction means every other screen (catalog, customers, the lines/
// services form itself) stays fully usable regardless of subscription
// status — see docs/roadmap.md Phase 14.
@Injectable()
export class PremiumGateService {
  constructor(private readonly repository: BillingRepository) {}

  async assertCanCreateInvoice(companyId: string): Promise<void> {
    const [fields, invoiceCount] = await Promise.all([
      this.repository.getBillingFields(companyId),
      this.repository.countInvoices(companyId),
    ]);

    if (invoiceCount < 1) {
      return; // free trial invoice — always allowed regardless of subscription
    }
    if (hasPremiumAccess(fields)) {
      return;
    }
    throw new PremiumRequiredException();
  }

  async hasPremiumAccess(companyId: string): Promise<boolean> {
    return hasPremiumAccess(await this.repository.getBillingFields(companyId));
  }
}

// Narrowed to just the two fields it actually reads (not the full
// BillingFields shape) so AdminService can reuse it directly off its own
// User/Company join row without assembling a fake full BillingFields object
// just to satisfy the parameter type.
export function hasPremiumAccess(
  fields: Pick<BillingFields, 'subscriptionStatus' | 'premiumGrantedUntil'>,
): boolean {
  if (fields.subscriptionStatus === SubscriptionStatus.ACTIVE) {
    return true;
  }
  return fields.premiumGrantedUntil !== null && fields.premiumGrantedUntil > new Date();
}
