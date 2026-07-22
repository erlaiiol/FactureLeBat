import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ValidateNested } from 'class-validator';
import { CreateManualColumnDto } from './create-manual-column.dto';
import { CreateManualRowDto } from './create-manual-row.dto';
import { ManualColumnsCoverRequiredRoles } from './manual-columns-cover-required-roles.validator';
import { ManualRowCellsValid } from './manual-row-cells-valid.validator';

// At minimum DESCRIPTION + QUANTITY + UNIT_PRICE + LINE_TOTAL — see
// ManualColumnsCoverRequiredRoles.
const MIN_MANUAL_COLUMNS = 4;
export const MAX_MANUAL_COLUMNS = 12;
export const MAX_MANUAL_ROWS = 200;

// Phase 9.5 manual mode's whole body: the free-form table underneath a
// MANUAL invoice. Required (via CreateInvoiceDto's ManualModeFieldsConsistency)
// exactly when entryMode is MANUAL, and forbidden otherwise.
export class CreateManualTableDto {
  @ArrayMinSize(MIN_MANUAL_COLUMNS)
  @ArrayMaxSize(MAX_MANUAL_COLUMNS)
  @ValidateNested({ each: true })
  @Type(() => CreateManualColumnDto)
  @ManualColumnsCoverRequiredRoles()
  columns: CreateManualColumnDto[];

  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_MANUAL_ROWS)
  @ValidateNested({ each: true })
  @Type(() => CreateManualRowDto)
  @ManualRowCellsValid()
  rows: CreateManualRowDto[];
}
