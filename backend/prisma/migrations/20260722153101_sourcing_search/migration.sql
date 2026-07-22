-- CreateEnum
CREATE TYPE "SourcingSearchKind" AS ENUM ('SUPPLIER_SEARCH', 'COMPLEMENTARY_SUGGESTIONS');

-- CreateTable
CREATE TABLE "SourcingSearch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" "SourcingSearchKind" NOT NULL,
    "queryHash" TEXT NOT NULL,
    "resultJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourcingSearch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SourcingSearch_companyId_createdAt_idx" ON "SourcingSearch"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SourcingSearch_companyId_kind_queryHash_key" ON "SourcingSearch"("companyId", "kind", "queryHash");

-- AddForeignKey
ALTER TABLE "SourcingSearch" ADD CONSTRAINT "SourcingSearch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
