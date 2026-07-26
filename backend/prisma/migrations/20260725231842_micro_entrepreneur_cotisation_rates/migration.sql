-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "cotisationPrestationBicBasisPoints" INTEGER NOT NULL DEFAULT 2120,
ADD COLUMN     "cotisationPrestationBncBasisPoints" INTEGER NOT NULL DEFAULT 2110,
ADD COLUMN     "cotisationVenteBasisPoints" INTEGER NOT NULL DEFAULT 1230,
ADD COLUMN     "versementLiberatoireOptIn" BOOLEAN NOT NULL DEFAULT false;
