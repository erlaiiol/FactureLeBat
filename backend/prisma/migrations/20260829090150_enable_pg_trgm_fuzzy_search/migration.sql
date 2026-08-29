-- CreateTable
CREATE TABLE "VoiceDraftRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceDraftRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VoiceDraftRequest_companyId_createdAt_idx" ON "VoiceDraftRequest"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "VoiceDraftRequest" ADD CONSTRAINT "VoiceDraftRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
