-- CreateTable
CREATE TABLE "CatalogFolder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CatalogFolderToProduct" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CatalogFolderToProduct_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_CatalogFolderToService" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CatalogFolderToService_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_CatalogFolderToDiscount" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CatalogFolderToDiscount_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "CatalogFolder_companyId_idx" ON "CatalogFolder"("companyId");

-- CreateIndex
CREATE INDEX "_CatalogFolderToProduct_B_index" ON "_CatalogFolderToProduct"("B");

-- CreateIndex
CREATE INDEX "_CatalogFolderToService_B_index" ON "_CatalogFolderToService"("B");

-- CreateIndex
CREATE INDEX "_CatalogFolderToDiscount_B_index" ON "_CatalogFolderToDiscount"("B");

-- AddForeignKey
ALTER TABLE "CatalogFolder" ADD CONSTRAINT "CatalogFolder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CatalogFolderToProduct" ADD CONSTRAINT "_CatalogFolderToProduct_A_fkey" FOREIGN KEY ("A") REFERENCES "CatalogFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CatalogFolderToProduct" ADD CONSTRAINT "_CatalogFolderToProduct_B_fkey" FOREIGN KEY ("B") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CatalogFolderToService" ADD CONSTRAINT "_CatalogFolderToService_A_fkey" FOREIGN KEY ("A") REFERENCES "CatalogFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CatalogFolderToService" ADD CONSTRAINT "_CatalogFolderToService_B_fkey" FOREIGN KEY ("B") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CatalogFolderToDiscount" ADD CONSTRAINT "_CatalogFolderToDiscount_A_fkey" FOREIGN KEY ("A") REFERENCES "CatalogFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CatalogFolderToDiscount" ADD CONSTRAINT "_CatalogFolderToDiscount_B_fkey" FOREIGN KEY ("B") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
