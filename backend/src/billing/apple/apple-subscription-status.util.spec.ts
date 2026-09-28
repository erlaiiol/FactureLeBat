import { Status } from '@apple/app-store-server-library';
import { SubscriptionStatus } from '../../../generated/prisma/enums';
import {
  mapAppleSubscriptionStatus,
  statusFromVerifiedTransaction,
} from './apple-subscription-status.util';

describe('mapAppleSubscriptionStatus', () => {
  it('maps ACTIVE to ACTIVE', () => {
    expect(mapAppleSubscriptionStatus(Status.ACTIVE)).toBe(SubscriptionStatus.ACTIVE);
  });

  it('maps both billing-trouble statuses to PAST_DUE', () => {
    expect(mapAppleSubscriptionStatus(Status.BILLING_RETRY)).toBe(SubscriptionStatus.PAST_DUE);
    expect(mapAppleSubscriptionStatus(Status.BILLING_GRACE_PERIOD)).toBe(
      SubscriptionStatus.PAST_DUE,
    );
  });

  it('maps EXPIRED and REVOKED to CANCELED', () => {
    expect(mapAppleSubscriptionStatus(Status.EXPIRED)).toBe(SubscriptionStatus.CANCELED);
    expect(mapAppleSubscriptionStatus(Status.REVOKED)).toBe(SubscriptionStatus.CANCELED);
  });
});

describe('statusFromVerifiedTransaction', () => {
  it('is ACTIVE for a transaction with no revocation and no (or future) expiry', () => {
    expect(statusFromVerifiedTransaction({})).toBe(SubscriptionStatus.ACTIVE);
    expect(statusFromVerifiedTransaction({ expiresDate: Date.now() + 60_000 })).toBe(
      SubscriptionStatus.ACTIVE,
    );
  });

  it('is CANCELED once revocationDate is set, regardless of expiresDate', () => {
    expect(
      statusFromVerifiedTransaction({
        revocationDate: Date.now() - 1000,
        expiresDate: Date.now() + 60_000,
      }),
    ).toBe(SubscriptionStatus.CANCELED);
  });

  it('is CANCELED once expiresDate is in the past', () => {
    expect(statusFromVerifiedTransaction({ expiresDate: Date.now() - 1000 })).toBe(
      SubscriptionStatus.CANCELED,
    );
  });
});
