-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "completedTours" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "tourEnabled" BOOLEAN NOT NULL DEFAULT true;
