-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "replacedByTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_replacedByTokenHash_key" ON "RefreshToken"("replacedByTokenHash");
