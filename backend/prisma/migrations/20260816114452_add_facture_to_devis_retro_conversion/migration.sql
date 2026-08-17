-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "createdFromFactureId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_createdFromFactureId_key" ON "Invoice"("createdFromFactureId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdFromFactureId_fkey" FOREIGN KEY ("createdFromFactureId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

