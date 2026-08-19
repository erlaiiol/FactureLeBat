-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE 'ACOMPTE_VERSE';

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "defaultDepositPercentageBasisPoints" INTEGER;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "depositAmountCents" INTEGER,
ADD COLUMN     "depositPaidAt" TIMESTAMP(3),
ADD COLUMN     "depositPercentageBasisPoints" INTEGER;
