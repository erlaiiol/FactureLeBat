-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "decennialInsuranceApplicable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "decennialInsuranceCoverageArea" TEXT,
ADD COLUMN     "decennialInsurancePolicyNumber" TEXT,
ADD COLUMN     "decennialInsurerName" TEXT;
