-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "smtpHost" TEXT,
ADD COLUMN     "smtpPasswordEncrypted" TEXT,
ADD COLUMN     "smtpPort" INTEGER,
ADD COLUMN     "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "smtpUser" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "sentToEmail" TEXT;
