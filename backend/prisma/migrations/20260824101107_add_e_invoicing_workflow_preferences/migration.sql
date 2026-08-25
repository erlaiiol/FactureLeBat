-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "autoAttachFacturX" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoSyncReceivedInvoices" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoTransmitViaPa" BOOLEAN NOT NULL DEFAULT false;
