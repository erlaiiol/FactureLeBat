import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  ActivityCategory,
  MarginMode,
  ServicePricingMode,
  ServiceVisibility,
} from '../../../generated/prisma/enums';
import { ServiceMarginConsistency } from './service-margin-consistency.validator';
import { ServicePricingConsistency } from './service-pricing-consistency.validator';

// Same finite-but-generous bound as CreateProductDto/CreateInvoiceLineDto:
// rejects an obviously-wrong input before it reaches invoice calculation,
// not a real business limit.
const MAX_PRICE_CENTS = 100_000_000; // 1,000,000.00 €
// Basis points, same convention as Company.vatRateBasisPoints — 10000 = 100%.
// A percentage service applies to (at most) the invoice's own visible
// subtotal, so anything above 100% would already be a nonsensical markup.
const MAX_PERCENTAGE_BASIS_POINTS = 10_000;

export class CreateServiceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  // Phase 13.5: FIXED (default) is today's typed-euro-amount behavior;
  // PERCENTAGE stores a share of the invoice instead — see
  // ServicePricingConsistency for the cross-field requirement below.
  @IsEnum(ServicePricingMode)
  @ServicePricingConsistency()
  pricingMode: ServicePricingMode = ServicePricingMode.FIXED;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_PRICE_CENTS)
  priceCents?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PERCENTAGE_BASIS_POINTS)
  percentageBasisPoints?: number;

  @IsEnum(ServiceVisibility)
  defaultVisibility: ServiceVisibility = ServiceVisibility.VISIBLE;

  // Phase 11: short artisan-defined reference (e.g. "MO-POSE"), same shape
  // as CreateProductDto.code — optional, freely editable, unique per row
  // when set (the uniqueness violation is turned into a clean 409 by
  // ServiceCatalogService).
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  // Phase 17: same URSSAF turnover categorization as CreateProductDto.
  // activityCategory — artisan-set, left unset by default.
  @IsOptional()
  @IsEnum(ActivityCategory)
  activityCategory?: ActivityCategory;

  // Phase 1.6: same margin declaration as CreateProductDto.marginMode —
  // unset by default. @ServiceMarginConsistency validates both enum
  // membership and cross-field consistency in one pass — see that
  // validator's own comment for why it's deliberately not paired with
  // @IsOptional()/@IsEnum() here, and docs/1.6/1.6-1-margin-data-model.md.
  @ServiceMarginConsistency()
  marginMode?: MarginMode;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PRICE_CENTS)
  marginAmountCents?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PERCENTAGE_BASIS_POINTS)
  marginPercentageBasisPoints?: number;

  // Phase 1.1-2: same folder picker as CreateProductDto.folderIds.
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  folderIds?: string[];
}
