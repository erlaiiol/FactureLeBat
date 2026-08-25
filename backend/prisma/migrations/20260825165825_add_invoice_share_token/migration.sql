-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "shareToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_shareToken_key" ON "Invoice"("shareToken");
