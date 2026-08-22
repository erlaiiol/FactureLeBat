-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "legalStatusConfirmedAt" TIMESTAMP(3);

-- Backfill: every pre-existing company already went through the old
-- full-form onboarding gate, so its legalStatus/vatRateBasisPoints are
-- already a real, artisan-confirmed value — mark them confirmed as of this
-- migration so no existing user is asked the new confirm-legal-status
-- question. Only companies created after this migration runs get NULL.
UPDATE "Company" SET "legalStatusConfirmedAt" = now() WHERE "legalStatusConfirmedAt" IS NULL;
