-- CreateEnum
CREATE TYPE "MarginMode" AS ENUM ('NET_AMOUNT', 'PERCENTAGE');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "marginAmountCents" INTEGER,
ADD COLUMN     "marginMode" "MarginMode",
ADD COLUMN     "marginPercentageBasisPoints" INTEGER;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "marginAmountCents" INTEGER,
ADD COLUMN     "marginMode" "MarginMode",
ADD COLUMN     "marginPercentageBasisPoints" INTEGER;
