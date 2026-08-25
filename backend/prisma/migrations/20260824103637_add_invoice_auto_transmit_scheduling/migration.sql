-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "scheduledTransmitAt" TIMESTAMP(3),
ADD COLUMN     "transmitCancelledAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Invoice_scheduledTransmitAt_idx" ON "Invoice"("scheduledTransmitAt");
