import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
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
// Matches CreateInvoiceLineDto's MAX_QUANTITY — same sanity-cap reasoning.
const MAX_PACKAGING_QUANTITY = 1_000_000;

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

  // Phase 8.5: how many `unit`s come in one sellable package (e.g. 9 for a
  // 9 m² box of flooring). Optional — most products still sell
  // continuously; when set, this is what an invoice line uses to compute
  // how many whole packages a job needs (see InvoiceCalculationService).
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(MAX_PACKAGING_QUANTITY)
  packagingQuantity?: number;
}
