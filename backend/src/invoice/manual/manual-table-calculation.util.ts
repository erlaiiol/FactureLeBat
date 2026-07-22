import { Prisma } from '../../../generated/prisma/client';
import { ManualColumnRole } from '../../../generated/prisma/enums';
import { parseManualDecimalCell } from './manual-cell-parser.util';

export interface ManualTableColumnLike {
  role: ManualColumnRole;
}

// Shared by the persisted-read path (InvoiceMapper.toManualInvoiceWithTotals)
// and the not-yet-saved preview path (toManualPreviewPdfData) so the two can
// never compute a different total for the same manual-table input — same
// "one function, two callers" precedent as redistribution.util.ts's
// expandServiceLineWeights. Unlike a GUIDED line, a manual row's total is
// never derived from quantity x unit price — it's the artisan's own
// freehand LINE_TOTAL cell, read directly (manual mode's whole principle is
// that the total stays fully editable, never computed behind the artisan's
// back). A blank/unparseable LINE_TOTAL contributes zero rather than
// throwing — ManualRowCellsValid is what rejects a genuinely invalid
// (non-blank, non-numeric) cell at the API boundary; by the time this runs,
// the input is already known-good.
export function computeManualRowTotalCents(
  columns: readonly ManualTableColumnLike[],
  cells: readonly string[],
): number {
  const lineTotalIndex = columns.findIndex((column) => column.role === ManualColumnRole.LINE_TOTAL);
  const lineTotalEuros =
    parseManualDecimalCell(cells[lineTotalIndex] ?? '') ?? new Prisma.Decimal(0);

  return lineTotalEuros.mul(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}
