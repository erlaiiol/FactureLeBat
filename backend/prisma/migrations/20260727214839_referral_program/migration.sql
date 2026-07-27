-- Phase 29: referral program.
-- referralCode is added nullable first, backfilled with a random unique
-- value per existing row, then tightened to NOT NULL + UNIQUE — the same
-- "nullable column, backfill, then tighten" shape Phase 7's unit-enum
-- migration used for a required column landing on a non-empty table.

-- AlterTable
ALTER TABLE "Company" ADD COLUMN "referralCode" TEXT;

UPDATE "Company"
SET "referralCode" = upper(substr(md5(gen_random_uuid()::text || id), 1, 10))
WHERE "referralCode" IS NULL;

ALTER TABLE "Company" ALTER COLUMN "referralCode" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Company_referralCode_key" ON "Company"("referralCode");

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "referrerCompanyId" TEXT NOT NULL,
    "referredCompanyId" TEXT NOT NULL,
    "rewardGrantedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Referral_referredCompanyId_key" ON "Referral"("referredCompanyId");

-- CreateIndex
CREATE INDEX "Referral_referrerCompanyId_idx" ON "Referral"("referrerCompanyId");

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerCompanyId_fkey" FOREIGN KEY ("referrerCompanyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredCompanyId_fkey" FOREIGN KEY ("referredCompanyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
