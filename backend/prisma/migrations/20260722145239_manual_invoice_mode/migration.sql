-- CreateEnum
CREATE TYPE "InvoiceEntryMode" AS ENUM ('GUIDED', 'MANUAL');

-- CreateEnum
CREATE TYPE "ManualColumnRole" AS ENUM ('DESCRIPTION', 'QUANTITY', 'UNIT_PRICE', 'CUSTOM');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "entryMode" "InvoiceEntryMode" NOT NULL DEFAULT 'GUIDED';

-- CreateTable
CREATE TABLE "ManualInvoiceColumn" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "role" "ManualColumnRole" NOT NULL,
    "label" TEXT NOT NULL,
    "widthPx" INTEGER,

    CONSTRAINT "ManualInvoiceColumn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualInvoiceRow" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "heightPx" INTEGER,

    CONSTRAINT "ManualInvoiceRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualInvoiceCell" (
    "id" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "columnId" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "ManualInvoiceCell_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManualInvoiceColumn_invoiceId_idx" ON "ManualInvoiceColumn"("invoiceId");

-- CreateIndex
CREATE INDEX "ManualInvoiceRow_invoiceId_idx" ON "ManualInvoiceRow"("invoiceId");

-- CreateIndex
CREATE INDEX "ManualInvoiceCell_rowId_idx" ON "ManualInvoiceCell"("rowId");

-- CreateIndex
CREATE INDEX "ManualInvoiceCell_columnId_idx" ON "ManualInvoiceCell"("columnId");

-- CreateIndex
CREATE UNIQUE INDEX "ManualInvoiceCell_rowId_columnId_key" ON "ManualInvoiceCell"("rowId", "columnId");

-- AddForeignKey
ALTER TABLE "ManualInvoiceColumn" ADD CONSTRAINT "ManualInvoiceColumn_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualInvoiceRow" ADD CONSTRAINT "ManualInvoiceRow_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualInvoiceCell" ADD CONSTRAINT "ManualInvoiceCell_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "ManualInvoiceRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualInvoiceCell" ADD CONSTRAINT "ManualInvoiceCell_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "ManualInvoiceColumn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
