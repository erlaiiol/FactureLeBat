-- CreateEnum
CREATE TYPE "EInvoiceTransmissionStatus" AS ENUM ('NOT_SENT', 'SENT', 'VALIDATED', 'DELIVERED', 'ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "superPdpAccessTokenEncrypted" TEXT,
ADD COLUMN     "superPdpConnectedAt" TIMESTAMP(3),
ADD COLUMN     "superPdpRefreshTokenEncrypted" TEXT,
ADD COLUMN     "superPdpTokenExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "eInvoiceRejectionReason" TEXT,
ADD COLUMN     "eInvoiceTransmissionStatus" "EInvoiceTransmissionStatus" NOT NULL DEFAULT 'NOT_SENT',
ADD COLUMN     "eInvoiceTransmittedAt" TIMESTAMP(3),
ADD COLUMN     "superPdpInvoiceId" TEXT;
