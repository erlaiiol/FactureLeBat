-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('NON_PAYEE', 'PAYEE', 'ANNULEE');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "lastReminderAt" TIMESTAMP(3),
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "status" "InvoiceStatus" NOT NULL DEFAULT 'NON_PAYEE';
