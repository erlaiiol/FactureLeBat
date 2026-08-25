-- CreateTable
CREATE TABLE "ReceivedInvoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "superPdpInvoiceId" TEXT NOT NULL,
    "issuerName" TEXT,
    "issuerSiret" TEXT,
    "number" TEXT,
    "issueDate" TIMESTAMP(3),
    "totalInclVatCents" INTEGER,
    "vatAmountCents" INTEGER,
    "currencyCode" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceivedInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReceivedInvoice_companyId_idx" ON "ReceivedInvoice"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ReceivedInvoice_companyId_superPdpInvoiceId_key" ON "ReceivedInvoice"("companyId", "superPdpInvoiceId");

-- AddForeignKey
ALTER TABLE "ReceivedInvoice" ADD CONSTRAINT "ReceivedInvoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
