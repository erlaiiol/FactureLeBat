-- Phase 29 correction: the filleul's reward is a Stripe discount (15€ -> 10€
-- off their first billing cycle), not a free premium month; the parrain
-- keeps the free-month grant instead — see
-- BillingService.grantReferralDiscount. Safe default, no backfill needed.

-- AlterTable
ALTER TABLE "Company" ADD COLUMN "pendingReferralDiscount" BOOLEAN NOT NULL DEFAULT false;
