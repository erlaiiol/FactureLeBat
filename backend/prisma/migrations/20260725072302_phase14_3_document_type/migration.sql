-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('DEVIS', 'FACTURE');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "devisNumberPrefix" TEXT NOT NULL DEFAULT 'DEV',
ADD COLUMN     "nextDevisNumber" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "convertedFromDevisId" TEXT,
ADD COLUMN     "documentType" "DocumentType" NOT NULL DEFAULT 'FACTURE';

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_convertedFromDevisId_key" ON "Invoice"("convertedFromDevisId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_convertedFromDevisId_fkey" FOREIGN KEY ("convertedFromDevisId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
