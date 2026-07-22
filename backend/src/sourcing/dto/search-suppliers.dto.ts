import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Unit } from '../../../generated/prisma/enums';

const MAX_QUANTITY = 1_000_000;

// Assembled server-side from data already on the invoice draft/line (Phase
// 10: "the artisan never types a query") — the frontend passes through
// fields it already has, nothing here is freehand-typed for this purpose.
export class SearchSuppliersDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  productName: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(MAX_QUANTITY)
  quantity: number;

  @IsEnum(Unit)
  unit: Unit;

  // Free text (city, or the full customer address the invoice already
  // carries) — never parsed/validated further server-side, only interpolated
  // into the model prompt to localize results. Optional: a search with no
  // location just skips that constraint.
  @IsOptional()
  @IsString()
  @MaxLength(300)
  customerLocation?: string;

  // Not persisted anywhere (no Invoice.jobDate field — this phase doesn't
  // need one): a one-off input for this search only, so an artisan can
  // still target "in 3 days" without the schema carrying a field most
  // invoices will never use.
  @IsOptional()
  @IsDateString()
  jobDate?: string;
}
