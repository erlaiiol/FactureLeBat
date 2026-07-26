import {
  ArrayMaxSize,
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
import { ActivityCategory, ServiceVisibility } from '../../../generated/prisma/enums';
import { RedistributionStrategy } from './redistribution-strategy.enum';
import { ServiceLineVisibilityConsistency } from './service-line-visibility-consistency.validator';

// Same bound as CreateInvoiceLineDto's MAX_UNIT_PRICE_CENTS/CreateProductDto's
// MAX_PRICE_CENTS — generous but finite, rejects an obviously-wrong input
// rather than modeling a real business limit.
const MAX_AMOUNT_CENTS = 100_000_000; // 1,000,000.00 €
// Matches CreateInvoiceDto's MAX_LINES: no real invoice needs a weight per
// line beyond that many entries either.
const MAX_WEIGHTS = 200;

export class CreateInvoiceServiceLineDto {
  // Soft reference to a saved Service, if the artisan picked one — same
  // "autofill, not a lock" rule as CreateInvoiceDto.customerId: name/
  // description/amountCents below are always what actually gets persisted,
  // confirmed to exist by InvoiceService.create but never re-read from the
  // Service record itself.
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsInt()
  @Min(0)
  @Max(MAX_AMOUNT_CENTS)
  amountCents: number;

  @IsEnum(ServiceVisibility)
  @ServiceLineVisibilityConsistency()
  visibility: ServiceVisibility;

  @IsOptional()
  @IsEnum(RedistributionStrategy)
  redistributionStrategy?: RedistributionStrategy;

  // Positional, aligned with CreateInvoiceDto.lines (weights[i] applies to
  // lines[i]) — only present (and only meaningful) for the WEIGHTED
  // strategy; see ServiceLineWeightsMatchLines for the length/sum checks
  // against the invoice's actual lines, which this DTO alone can't perform.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_WEIGHTS)
  @IsInt({ each: true })
  @Min(0, { each: true })
  weights?: number[];

  // Phase 17: same soft-snapshot rule as CreateInvoiceLineDto.activityCategory
  // — taken from the picked catalog Service's activityCategory when this
  // line was added, left unset for a freehand service line.
  @IsOptional()
  @IsEnum(ActivityCategory)
  activityCategory?: ActivityCategory;
}
