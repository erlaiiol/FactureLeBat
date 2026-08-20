-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "customFooterMessage" TEXT,
ADD COLUMN     "customFooterOnDevis" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "customFooterOnFacture" BOOLEAN NOT NULL DEFAULT false;
