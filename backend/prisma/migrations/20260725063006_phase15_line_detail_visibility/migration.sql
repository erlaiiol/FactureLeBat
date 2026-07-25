-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "showBillingDetail" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showUnitDetail" BOOLEAN NOT NULL DEFAULT true;
