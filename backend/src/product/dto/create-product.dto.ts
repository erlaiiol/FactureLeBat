import {
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

// Generous but finite upper bound: rejects an obviously-wrong input (a stray
// extra zero) before it reaches invoice-line prefill, not a real business
// limit. Matches CreateInvoiceLineDto's MAX_UNIT_PRICE_CENTS.
const MAX_PRICE_CENTS = 100_000_000; // 1,000,000.00 €

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  unit: string;

  @IsInt()
  @Min(0)
  @Max(MAX_PRICE_CENTS)
  priceCents: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  supplierName?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  supplierUrl?: string;
}
