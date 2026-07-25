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
          'each manual row must supply exactly one cell per column, a non-empty description, and a valid non-negative unit price/line total (or a blank line total)',
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
      // Same blank exemption as LINE_TOTAL below: unit price is never read
      // by computeManualRowTotalCents, only displayed, so it can't block
      // submission when the artisan hasn't filled it in.
      case ManualColumnRole.UNIT_PRICE:
        return cell.trim().length === 0 || parseManualDecimalCell(cell) !== null;
      // A blank line total contributes zero to the invoice rather than
      // failing validation — manual mode's whole principle is that the
      // artisan fills this in at their own pace (see
      // computeManualRowTotalCents), never a computed/locked field.
      case ManualColumnRole.LINE_TOTAL:
        return cell.trim().length === 0 || parseManualDecimalCell(cell) !== null;
      // Free text: quantity is informational only on the manual canvas
      // (e.g. "2 boites") and never fed into the row's price — only
      // LINE_TOTAL is. CUSTOM columns are unrestricted for the same reason.
      case ManualColumnRole.QUANTITY:
      case ManualColumnRole.CUSTOM:
        return true;
      default:
        return false;
    }
  });
}
