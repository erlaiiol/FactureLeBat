import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

// Same bound as CreateInvoiceServiceLineDto's MAX_AMOUNT_CENTS — generous
// but finite, rejects an obviously-wrong input rather than modeling a real
// business limit.
const MAX_AMOUNT_CENTS = 100_000_000; // 1,000,000.00 €

// Phase 32: a remise applied to the invoice. Unlike CreateInvoiceServiceLineDto,
// there is no discountType/percentageBasisPoints here — a PERCENTAGE
// discount is resolved to a concrete amountCents client-side, at the moment
// it's added to the draft (see InvoiceDraftStore.resolvedDiscountAmountCents),
// same "computed at build time, not typed per invoice" precedent as a
// PERCENTAGE Service line.
export class CreateInvoiceDiscountLineDto {
  // Soft reference to a saved Discount, if the artisan picked one — same
  // "autofill, not a lock" rule as CreateInvoiceServiceLineDto.serviceId:
  // name/amountCents below are always what actually gets persisted, never
  // re-read from the Discount record itself.
  @IsOptional()
  @IsUUID()
  discountId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsInt()
  @Min(0)
  @Max(MAX_AMOUNT_CENTS)
  amountCents: number;
}
