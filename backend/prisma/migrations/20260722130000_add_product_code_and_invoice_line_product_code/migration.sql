-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "code" TEXT;

-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "productCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");
