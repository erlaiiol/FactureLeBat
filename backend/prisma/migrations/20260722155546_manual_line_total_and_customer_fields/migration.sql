-- AlterEnum
ALTER TYPE "ManualColumnRole" ADD VALUE 'LINE_TOTAL';

-- CreateTable
CREATE TABLE "InvoiceCustomerField" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "InvoiceCustomerField_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceCustomerField_invoiceId_idx" ON "InvoiceCustomerField"("invoiceId");

-- AddForeignKey
ALTER TABLE "InvoiceCustomerField" ADD CONSTRAINT "InvoiceCustomerField_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
