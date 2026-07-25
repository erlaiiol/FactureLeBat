import { SubscriptionStatus } from '../../../generated/prisma/enums';
import { mapStripeSubscriptionStatus } from './subscription-status.util';

describe('mapStripeSubscriptionStatus', () => {
  it.each([
    ['active', SubscriptionStatus.ACTIVE],
    ['trialing', SubscriptionStatus.ACTIVE],
    ['past_due', SubscriptionStatus.PAST_DUE],
    ['canceled', SubscriptionStatus.CANCELED],
    ['unpaid', SubscriptionStatus.CANCELED],
    ['incomplete', SubscriptionStatus.NONE],
    ['incomplete_expired', SubscriptionStatus.NONE],
    ['paused', SubscriptionStatus.NONE],
  ] as const)('maps Stripe status %s to %s', (stripeStatus, expected) => {
    expect(mapStripeSubscriptionStatus(stripeStatus)).toBe(expected);
  });
});
