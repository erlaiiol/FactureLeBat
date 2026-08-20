-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "earlyPaymentDiscountMention" TEXT DEFAULT 'Pas d''escompte pour paiement anticipé.';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "isProfessional" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "reverseChargeApplicable" BOOLEAN NOT NULL DEFAULT false;
