import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { LineMode, WasteSurcharge } from '../../../generated/prisma/enums';
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

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  unit: string;

  @IsEnum(LineMode)
  mode: LineMode;

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
}
