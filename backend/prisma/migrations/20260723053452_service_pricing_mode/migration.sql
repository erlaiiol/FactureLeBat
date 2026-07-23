-- CreateEnum
CREATE TYPE "ServicePricingMode" AS ENUM ('FIXED', 'PERCENTAGE');

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "percentageBasisPoints" INTEGER,
ADD COLUMN     "pricingMode" "ServicePricingMode" NOT NULL DEFAULT 'FIXED',
ALTER COLUMN "priceCents" DROP NOT NULL;
