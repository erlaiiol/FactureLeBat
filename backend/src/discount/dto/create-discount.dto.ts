import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { DiscountType } from '../../../generated/prisma/enums';
import { DiscountConsistency } from './discount-consistency.validator';

// Same finite-but-generous bound as CreateProductDto/CreateServiceDto's own
// price bounds — rejects an obviously-wrong input, not a real business limit.
const MAX_FIXED_AMOUNT_CENTS = 100_000_000; // 1,000,000.00 €
// Basis points, same convention as Company.vatRateBasisPoints — 10000 = 100%.
const MAX_PERCENTAGE_BASIS_POINTS = 10_000;

export class CreateDiscountDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  // Phase 32: FIXED (default) is a typed euro amount (fixedAmountCents);
  // PERCENTAGE stores a share of the invoice's product + visible-service
  // subtotal instead (percentageBasisPoints) — see DiscountConsistency for
  // the cross-field requirement below.
  @IsEnum(DiscountType)
  @DiscountConsistency()
  discountType: DiscountType = DiscountType.FIXED;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_FIXED_AMOUNT_CENTS)
  fixedAmountCents?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PERCENTAGE_BASIS_POINTS)
  percentageBasisPoints?: number;
}
