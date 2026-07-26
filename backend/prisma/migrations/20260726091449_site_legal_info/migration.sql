-- CreateTable
CREATE TABLE "SiteLegalInfo" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "publisherName" TEXT NOT NULL DEFAULT '',
    "siret" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "directorOfPublication" TEXT NOT NULL DEFAULT '',
    "hostingProviderName" TEXT NOT NULL DEFAULT '',
    "hostingProviderAddress" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteLegalInfo_pkey" PRIMARY KEY ("id")
);
