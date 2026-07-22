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
import { ServiceVisibility } from '../../../generated/prisma/enums';

// Same finite-but-generous bound as CreateProductDto/CreateInvoiceLineDto:
// rejects an obviously-wrong input before it reaches invoice calculation,
// not a real business limit.
const MAX_PRICE_CENTS = 100_000_000; // 1,000,000.00 €

export class CreateServiceDto {
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
  @Max(MAX_PRICE_CENTS)
  priceCents: number;

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
}
