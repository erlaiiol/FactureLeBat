-- Phase 33: deadline for the limited-time "1er mois à 2€" Premium offer,
-- started once (PlanGateService.recordInvoiceCreated) the moment a
-- company's invoice count goes from 0 to 1. Nullable, no backfill: existing
-- companies simply have no active offer until they create their next
-- invoice (which, being already past their first, won't start one either —
-- see PlanGateService for why that's correct).

-- AlterTable
ALTER TABLE "Company" ADD COLUMN "trialOfferExpiresAt" TIMESTAMP(3);
