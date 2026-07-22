import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { ManualColumnRole } from '../../../../generated/prisma/enums';
import { parseManualDecimalCell } from '../../manual/manual-cell-parser.util';
import { CreateManualColumnDto } from './create-manual-column.dto';
import { CreateManualRowDto } from './create-manual-row.dto';
import { CreateManualTableDto } from './create-manual-table.dto';

// A WEIGHTED service line's weights need the sibling `lines` array to
// validate against (see ServiceLineWeightsMatchLines) — same shape of
// problem here: a row's cells can only be checked against the table's
// `columns`, which a single CreateManualRowDto has no visibility into. Lives
// on CreateManualTableDto instead, where both fields are available via
// ValidationArguments.object.
export function ManualRowCellsValid(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'manualRowCellsValid',
      target: object.constructor,
      propertyName,
      options: {
        message:
          'each manual row must supply exactly one cell per column, a non-empty description, and a valid non-negative quantity/unit price',
        ...options,
      },
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const dto = args.object as CreateManualTableDto;
          const columns = dto.columns ?? [];
          const rows = (value as CreateManualRowDto[] | undefined) ?? [];
          return rows.every((row) => rowIsValid(row, columns));
        },
      },
    });
  };
}

function rowIsValid(row: CreateManualRowDto, columns: CreateManualColumnDto[]): boolean {
  const cells = row.cells ?? [];
  if (cells.length !== columns.length) {
    return false;
  }
  return columns.every((column, index) => {
    const cell = cells[index] ?? '';
    switch (column.role) {
      case ManualColumnRole.DESCRIPTION:
        return cell.trim().length > 0;
      case ManualColumnRole.QUANTITY:
      case ManualColumnRole.UNIT_PRICE:
        return parseManualDecimalCell(cell) !== null;
      case ManualColumnRole.CUSTOM:
        return true;
      default:
        return false;
    }
  });
}
