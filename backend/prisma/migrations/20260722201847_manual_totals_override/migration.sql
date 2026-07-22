-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "subtotalOverrideCents" INTEGER,
ADD COLUMN     "totalOverrideCents" INTEGER,
ADD COLUMN     "vatOverrideCents" INTEGER;
