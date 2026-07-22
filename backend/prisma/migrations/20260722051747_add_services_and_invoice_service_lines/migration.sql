-- CreateEnum
CREATE TYPE "ServiceVisibility" AS ENUM ('VISIBLE', 'REDISTRIBUTED');

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER NOT NULL,
    "defaultVisibility" "ServiceVisibility" NOT NULL DEFAULT 'VISIBLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceServiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "serviceId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "amountCents" INTEGER NOT NULL,
    "visibility" "ServiceVisibility" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceServiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceServiceLineWeight" (
    "id" TEXT NOT NULL,
    "invoiceServiceLineId" TEXT NOT NULL,
    "invoiceLineId" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,

    CONSTRAINT "InvoiceServiceLineWeight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceServiceLine_invoiceId_idx" ON "InvoiceServiceLine"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceServiceLineWeight_invoiceServiceLineId_invoiceLineId_key" ON "InvoiceServiceLineWeight"("invoiceServiceLineId", "invoiceLineId");

-- AddForeignKey
ALTER TABLE "InvoiceServiceLine" ADD CONSTRAINT "InvoiceServiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceServiceLine" ADD CONSTRAINT "InvoiceServiceLine_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceServiceLineWeight" ADD CONSTRAINT "InvoiceServiceLineWeight_invoiceServiceLineId_fkey" FOREIGN KEY ("invoiceServiceLineId") REFERENCES "InvoiceServiceLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceServiceLineWeight" ADD CONSTRAINT "InvoiceServiceLineWeight_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "InvoiceLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
