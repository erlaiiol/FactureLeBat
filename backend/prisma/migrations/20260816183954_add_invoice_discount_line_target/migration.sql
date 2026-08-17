-- AlterTable
ALTER TABLE "InvoiceDiscountLine" ADD COLUMN     "targetInvoiceLineId" TEXT,
ADD COLUMN     "targetInvoiceServiceLineId" TEXT;

-- CreateIndex
CREATE INDEX "InvoiceDiscountLine_targetInvoiceLineId_idx" ON "InvoiceDiscountLine"("targetInvoiceLineId");

-- CreateIndex
CREATE INDEX "InvoiceDiscountLine_targetInvoiceServiceLineId_idx" ON "InvoiceDiscountLine"("targetInvoiceServiceLineId");

-- AddForeignKey
ALTER TABLE "InvoiceDiscountLine" ADD CONSTRAINT "InvoiceDiscountLine_targetInvoiceLineId_fkey" FOREIGN KEY ("targetInvoiceLineId") REFERENCES "InvoiceLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDiscountLine" ADD CONSTRAINT "InvoiceDiscountLine_targetInvoiceServiceLineId_fkey" FOREIGN KEY ("targetInvoiceServiceLineId") REFERENCES "InvoiceServiceLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
