-- DropIndex
DROP INDEX "Invoice_number_key";

-- AlterTable
ALTER TABLE "Company" DROP COLUMN "nextDevisNumber",
DROP COLUMN "nextInvoiceNumber";

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_companyId_number_key" ON "Invoice"("companyId", "number");

