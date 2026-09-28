import { Status, type JWSTransactionDecodedPayload } from '@apple/app-store-server-library';
import { SubscriptionStatus } from '../../../generated/prisma/enums';

// Maps Apple's own (5-value) auto-renewable subscription status down to
// this app's 3-value SubscriptionStatus (see schema.prisma's comment on the
// enum) — same reasoning and shape as mapStripeSubscriptionStatus.
// BILLING_RETRY/BILLING_GRACE_PERIOD both mean "still has access, payment is
// having trouble" — the same PAST_DUE bucket Stripe's own past_due maps to.
export function mapAppleSubscriptionStatus(status: Status): SubscriptionStatus {
  switch (status) {
    case Status.ACTIVE:
      return SubscriptionStatus.ACTIVE;
    case Status.BILLING_RETRY:
    case Status.BILLING_GRACE_PERIOD:
      return SubscriptionStatus.PAST_DUE;
    case Status.EXPIRED:
    case Status.REVOKED:
      return SubscriptionStatus.CANCELED;
    default:
      return SubscriptionStatus.NONE;
  }
}

// Used only right after a client-side purchase (POST /billing/apple/
// verify-purchase), where the App Store Server Notifications V2 `Data.status`
// enum above isn't available yet — only the transaction JWS itself is. A
// freshly verified, non-revoked transaction whose expiresDate (if any, i.e.
// an auto-renewable product) hasn't already passed is treated as ACTIVE;
// every subsequent status change (renewal, billing retry, expiry, refund)
// arrives via handleAppleNotification and overwrites this using the more
// precise Status enum above — same "trust the client's proof of purchase
// immediately, let the webhook be the source of truth afterward" posture
// Apple's own StoreKit2 guidance recommends.
export function statusFromVerifiedTransaction(
  transaction: JWSTransactionDecodedPayload,
): SubscriptionStatus {
  if (transaction.revocationDate) {
    return SubscriptionStatus.CANCELED;
  }
  if (transaction.expiresDate && transaction.expiresDate < Date.now()) {
    return SubscriptionStatus.CANCELED;
  }
  return SubscriptionStatus.ACTIVE;
}
