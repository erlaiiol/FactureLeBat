-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "tourPreferenceChosenAt" TIMESTAMP(3);

-- Existing companies already went through onboarding without this prompt —
-- treat their current tourEnabled as an already-made choice so only accounts
-- created from now on are asked "Activer les tutoriels ?".
UPDATE "Company" SET "tourPreferenceChosenAt" = CURRENT_TIMESTAMP;
