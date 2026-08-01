-- Phase 30: replace the single flat "premium" plan with 3 tiers
-- (ESSENTIEL/PRO/PREMIUM). Hand-written (not `prisma migrate dev`) so the
-- two new nullable Company columns can be backfilled from existing data in
-- the same migration — a currently-active subscriber or a currently-valid
-- grant must resolve to PREMIUM, the only tier that existed before this
-- phase, with zero behavior change. See docs/roadmap.md Phase 30.

-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('ESSENTIEL', 'PRO', 'PREMIUM');

-- AlterTable: Company
ALTER TABLE "Company" ADD COLUMN "subscriptionPlanTier" "PlanTier";
ALTER TABLE "Company" ADD COLUMN "grantedPlanTier" "PlanTier";

-- Backfill: every company with a subscription that has ever reached ACTIVE
-- or PAST_DUE was, before this migration, a subscriber to the single 15€
-- plan — resolve them to PREMIUM. CANCELED/NONE stay NULL (no active
-- subscription to resolve a tier for).
UPDATE "Company"
SET "subscriptionPlanTier" = 'PREMIUM'
WHERE "subscriptionStatus" IN ('ACTIVE', 'PAST_DUE');

-- Backfill: every company with a still-valid grant (admin or promo code,
-- both previously meant "premium access") resolves to PREMIUM.
UPDATE "Company"
SET "grantedPlanTier" = 'PREMIUM'
WHERE "premiumGrantedUntil" IS NOT NULL AND "premiumGrantedUntil" > CURRENT_TIMESTAMP;

-- AlterTable: PromoCode — every pre-existing code only ever meant premium.
ALTER TABLE "PromoCode" ADD COLUMN "planTier" "PlanTier" NOT NULL DEFAULT 'PREMIUM';

-- AlterTable: Referral — actual days granted per referral, replacing the
-- flat REFERRAL_PARRAIN_REWARD_DAYS constant this phase removes. Backfill
-- every already-granted referral with the pre-Phase-30 flat amount (30) so
-- historical totals on "Mon abonnement" don't silently drop to zero.
ALTER TABLE "Referral" ADD COLUMN "rewardDaysGranted" INTEGER;
UPDATE "Referral" SET "rewardDaysGranted" = 30 WHERE "rewardGrantedAt" IS NOT NULL;
