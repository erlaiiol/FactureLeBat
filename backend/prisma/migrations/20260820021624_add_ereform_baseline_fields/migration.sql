-- CreateEnum
CREATE TYPE "NatureOperation" AS ENUM ('LIVRAISON_BIENS', 'PRESTATION_SERVICES', 'BIENS_ET_SERVICES');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "vatOnDebitsOption" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "customerSiret" TEXT,
ADD COLUMN     "deliveryAddress" TEXT,
ADD COLUMN     "manualNatureOfOperation" "NatureOperation";
