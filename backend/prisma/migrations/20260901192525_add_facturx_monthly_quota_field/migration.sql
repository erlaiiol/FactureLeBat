-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "facturXFirstUsedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Invoice_companyId_facturXFirstUsedAt_idx" ON "Invoice"("companyId", "facturXFirstUsedAt");
