-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "packagingQuantity" DECIMAL(10,3),
ADD COLUMN     "roundUpToPackaging" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "packagingQuantity" DECIMAL(10,3);
