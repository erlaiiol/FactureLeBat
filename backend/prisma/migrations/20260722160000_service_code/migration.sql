-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Service_code_key" ON "Service"("code");
