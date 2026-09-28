-- Phase 1.7: native iOS In-App Purchase, a second and independent
-- subscription path alongside Stripe (subscriptionStatus/subscriptionPlanTier
-- above) — see schema.prisma's comment on these 3 new columns and
-- PlanGateService.getEffectivePlanTier's 3-way higherTier resolution.
-- appleSubscriptionStatus reuses the existing SubscriptionStatus enum
-- (no new enum needed); appleSubscriptionPlanTier reuses PlanTier. All
-- nullable/defaulted: every existing company resolves to no Apple
-- subscription at all, zero behavior change until a real iOS purchase is
-- verified.

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "appleOriginalTransactionId" TEXT,
ADD COLUMN     "appleSubscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "appleSubscriptionPlanTier" "PlanTier";

-- CreateIndex
CREATE UNIQUE INDEX "Company_appleOriginalTransactionId_key" ON "Company"("appleOriginalTransactionId");
