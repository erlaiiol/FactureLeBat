-- CreateEnum
CREATE TYPE "SignatureMethod" AS ENUM ('DRAWN', 'PHOTO');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "manuallySigned" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "InvoiceSignature" (
    "invoiceId" TEXT NOT NULL,
    "image" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "method" "SignatureMethod" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceSignature_pkey" PRIMARY KEY ("invoiceId")
);

-- AddForeignKey
ALTER TABLE "InvoiceSignature" ADD CONSTRAINT "InvoiceSignature_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
