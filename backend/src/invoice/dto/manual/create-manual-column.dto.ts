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
import { ManualColumnRole } from '../../../../generated/prisma/enums';

// Generous but finite pixel bounds — reject an obviously-wrong drag/resize
// value, not model a real layout limit.
const MIN_COLUMN_WIDTH_PX = 40;
const MAX_COLUMN_WIDTH_PX = 800;

export class CreateManualColumnDto {
  // See ManualColumnRole (schema.prisma) for what each role means for
  // pricing — CreateManualTableDto's ManualColumnsCoverRequiredRoles
  // validator enforces exactly one DESCRIPTION/QUANTITY/UNIT_PRICE.
  @IsEnum(ManualColumnRole)
  role: ManualColumnRole;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  label: string;

  // Persisted drag-resize state — purely presentational.
  @IsOptional()
  @IsInt()
  @Min(MIN_COLUMN_WIDTH_PX)
  @Max(MAX_COLUMN_WIDTH_PX)
  widthPx?: number;
}
