import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ActivityCategory, Unit, WasteSurcharge } from '../../../generated/prisma/enums';
import { WasteSurchargeOnlyForArea } from './waste-surcharge-only-for-area.validator';

// Upper bounds are generous for a real-world invoice line but finite: they
// exist to reject obviously-wrong input (a stray extra zero, a client bug)
// before it reaches the calculation service, not to model a real business
// limit.
const MAX_QUANTITY = 1_000_000;
const MAX_UNIT_PRICE_CENTS = 100_000_000; // 1,000,000.00 €

export class CreateInvoiceLineDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  description: string;

  // Phase 7: a fixed, curated vocabulary — the client picks one from a
  // dropdown, never types free text. The AREA/UNIT calculation mode is
  // derived from this value (isAreaUnit()), not accepted as separate input.
  @IsEnum(Unit)
  unit: Unit;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(MAX_QUANTITY)
  quantity: number;

  @IsInt()
  @Min(0)
  @Max(MAX_UNIT_PRICE_CENTS)
  unitPriceCents: number;

  @IsEnum(WasteSurcharge)
  @WasteSurchargeOnlyForArea()
  wasteSurcharge: WasteSurcharge = WasteSurcharge.NONE;

  // Phase 8.5: how many `unit`s come in one sellable package (e.g. 9 for a
  // 9 m² box). Freehand/snapshotted, same "autofill, not a lock" rule as
  // every other soft catalog reference — optional because most lines are
  // still sold continuously.
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(MAX_QUANTITY)
  packagingQuantity?: number;

  // Whether the billed quantity rounds up to the next whole package.
  // Defaults to true (automated calculation is the default; the artisan
  // opts out for exact-quantity billing) and is inert when
  // packagingQuantity is absent — no cross-field validator needed since
  // there's nothing to round to in that case.
  @IsOptional()
  @IsBoolean()
  roundUpToPackaging?: boolean = true;

  // Freehand product reference (e.g. "UC204850") — same snapshot spirit as
  // packagingQuantity above, never a live reference to a Product row.
  @IsOptional()
  @IsString()
  @MaxLength(50)
  productCode?: string;

  // Phase 15: per-line PDF rendering toggles, set from the mandatory
  // preview screen — purely a display concern, never read by
  // InvoiceCalculationService. Both default true so an invoice created
  // without ever visiting the toggle UI renders exactly as before.
  @IsOptional()
  @IsBoolean()
  showUnitDetail?: boolean = true;

  @IsOptional()
  @IsBoolean()
  showBillingDetail?: boolean = true;

  // Phase 17: snapshotted from the picked catalog Product's activityCategory
  // at the moment it was added to the invoice — same soft-snapshot spirit as
  // productCode above, never re-read from Product afterwards. Left unset for
  // a freehand line or an uncategorized product.
  @IsOptional()
  @IsEnum(ActivityCategory)
  activityCategory?: ActivityCategory;
}
