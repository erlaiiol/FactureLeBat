import Stripe from 'stripe';
import { SubscriptionStatus } from '../../../generated/prisma/enums';

// Maps Stripe's own (larger) subscription status enum down to this app's
// three-value SubscriptionStatus (see schema.prisma's comment on the enum).
// active/trialing both grant access — this app never actually configures a
// Stripe trial (its own free-invoice trial lives outside Stripe entirely),
// but mapping trialing -> ACTIVE defensively costs nothing and is correct
// if one is ever added. incomplete/incomplete_expired/paused all mean "no
// payment ever actually went through" — treated as NONE, not CANCELED,
// since nothing was ever active to cancel.
export function mapStripeSubscriptionStatus(
  status: Stripe.Subscription.Status,
): SubscriptionStatus {
  switch (status) {
    case 'active':
    case 'trialing':
      return SubscriptionStatus.ACTIVE;
    case 'past_due':
      return SubscriptionStatus.PAST_DUE;
    case 'canceled':
    case 'unpaid':
      return SubscriptionStatus.CANCELED;
    case 'incomplete':
    case 'incomplete_expired':
    case 'paused':
      return SubscriptionStatus.NONE;
    default:
      return SubscriptionStatus.NONE;
  }
}
