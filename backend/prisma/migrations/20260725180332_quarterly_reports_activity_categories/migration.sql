-- CreateEnum
CREATE TYPE "DeclarationFrequency" AS ENUM ('MENSUELLE', 'TRIMESTRIELLE');

-- CreateEnum
CREATE TYPE "ActivityCategory" AS ENUM ('VENTE_MARCHANDISES', 'PRESTATION_BIC', 'PRESTATION_BNC');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "declarationFrequency" "DeclarationFrequency" NOT NULL DEFAULT 'TRIMESTRIELLE',
ADD COLUMN     "microEntrepreneurCeiling" INTEGER;

-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "activityCategory" "ActivityCategory";

-- AlterTable
ALTER TABLE "InvoiceServiceLine" ADD COLUMN     "activityCategory" "ActivityCategory";

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "activityCategory" "ActivityCategory";

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "activityCategory" "ActivityCategory";
