-- Out-of-order protection for Stripe webhooks and Apple notifications: each
-- source remembers the timestamp of the last event it applied, and an older
-- event arriving late is ignored (see BillingRepository). Nullable: existing
-- companies simply accept their next event.

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "stripeEventAt" TIMESTAMP(3),
ADD COLUMN     "appleEventAt" TIMESTAMP(3);
