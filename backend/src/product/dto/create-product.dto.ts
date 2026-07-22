import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Unit } from '../../../generated/prisma/enums';

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

  // Phase 7: same fixed unit vocabulary as invoice lines (see
  // backend/src/common/unit.util.ts) — a dropdown, never free text.
  @IsEnum(Unit)
  unit: Unit;

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
