import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ActivityCategory, MarginMode, Unit } from '../../../generated/prisma/enums';
import { ProductMarginConsistency } from './product-margin-consistency.validator';

// Generous but finite upper bound: rejects an obviously-wrong input (a stray
// extra zero) before it reaches invoice-line prefill, not a real business
// limit. Matches CreateInvoiceLineDto's MAX_UNIT_PRICE_CENTS.
const MAX_PRICE_CENTS = 100_000_000; // 1,000,000.00 €
// Matches CreateInvoiceLineDto's MAX_QUANTITY — same sanity-cap reasoning.
const MAX_PACKAGING_QUANTITY = 1_000_000;
// Basis points, same convention as Company.vatRateBasisPoints — 10000 = 100%.
const MAX_PERCENTAGE_BASIS_POINTS = 10_000;

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

  // Phase 11: short artisan-defined reference (e.g. "UC204850"). Optional,
  // freely editable, unique per row when set (see the DB constraint) — the
  // uniqueness violation is turned into a clean 409 by ProductService.
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

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

  // Phase 17: which URSSAF turnover category this product's sales fall
  // under — artisan-set, left unset by default (see docs/roadmap.md Phase
  // 17's "No automatic activity-category detection" non-goal).
  @IsOptional()
  @IsEnum(ActivityCategory)
  activityCategory?: ActivityCategory;

  // Phase 1.6: what the artisan actually keeps per unit sold — unset by
  // default (no margin declared). @ProductMarginConsistency validates both
  // enum membership and cross-field consistency in one pass — see that
  // validator's own comment for why it's deliberately not paired with
  // @IsOptional()/@IsEnum() here, and docs/1.6/1.6-1-margin-data-model.md.
  @ProductMarginConsistency()
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

  // Phase 1.1-2: zero, one, or several CatalogFolder ids this product should
  // belong to — committed only when the form is actually saved (see
  // AdvancedSettingsComponent's picker). Cross-tenant ids are silently
  // dropped, never trusted outright (see CatalogFolderService.
  // filterOwnedFolderIds).
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  folderIds?: string[];
}
