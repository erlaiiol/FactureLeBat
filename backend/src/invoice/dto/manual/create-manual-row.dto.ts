import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// Generous but finite — reject an obviously-wrong drag/resize value, not
// model a real layout limit.
const MIN_ROW_HEIGHT_PX = 24;
const MAX_ROW_HEIGHT_PX = 400;
// Mirrors CreateManualTableDto's MAX_MANUAL_COLUMNS — a row can never have
// more cells than the table has columns.
const MAX_CELLS_PER_ROW = 12;

export class CreateManualRowDto {
  // Persisted drag-resize state — purely presentational.
  @IsOptional()
  @IsInt()
  @Min(MIN_ROW_HEIGHT_PX)
  @Max(MAX_ROW_HEIGHT_PX)
  heightPx?: number;

  // Positional, aligned with the sibling CreateManualTableDto.columns array
  // (cells[i] targets columns[i]) — same convention as service lines'
  // weights[i]/lines[i] (see ServiceLineWeightsMatchLines). Exact length and
  // per-cell validity (non-empty description, parseable quantity/unit price)
  // is checked by ManualRowCellsValid on the parent table, which is the only
  // place both `columns` and `rows` are visible together.
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_CELLS_PER_ROW)
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  cells: string[];
}
