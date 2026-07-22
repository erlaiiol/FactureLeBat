import { Prisma } from '../../../generated/prisma/client';
import { ManualColumnRole, Unit, WasteSurcharge } from '../../../generated/prisma/enums';
import { InvoiceCalculationService } from '../calculation/invoice-calculation.service';
import { parseManualDecimalCell } from './manual-cell-parser.util';

export interface ManualTableColumnLike {
  role: ManualColumnRole;
}

// Shared by the persisted-read path (InvoiceMapper.toManualInvoiceWithTotals)
// and the not-yet-saved preview path (toManualPreviewPdfData) so the two can
// never compute a different total for the same manual-table input — same
// "one function, two callers" precedent as redistribution.util.ts's
// expandServiceLineWeights. A manual row is priced exactly like a GUIDED
// UNIT-mode line (plain quantity x unit price, no waste surcharge, no
// packaging) — those concepts don't exist on the manual canvas, so
// InvoiceCalculationService.computeLineTotal is reused as-is rather than
// duplicated. An unparseable/missing quantity or unit price cell contributes
// zero rather than throwing — CreateManualTableDto's validators are what
// reject a bad cell at the API boundary; by the time this runs, the input is
// already known-good.
export function computeManualRowTotalCents(
  calculationService: InvoiceCalculationService,
  columns: readonly ManualTableColumnLike[],
  cells: readonly string[],
): number {
  const quantityIndex = columns.findIndex((column) => column.role === ManualColumnRole.QUANTITY);
  const unitPriceIndex = columns.findIndex((column) => column.role === ManualColumnRole.UNIT_PRICE);

  const quantity = parseManualDecimalCell(cells[quantityIndex] ?? '') ?? new Prisma.Decimal(0);
  const unitPriceEuros =
    parseManualDecimalCell(cells[unitPriceIndex] ?? '') ?? new Prisma.Decimal(0);
  const unitPriceCents = unitPriceEuros
    .mul(100)
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
    .toNumber();

  return calculationService.computeLineTotal({
    unit: Unit.UNIT,
    quantity,
    unitPriceCents,
    wasteSurcharge: WasteSurcharge.NONE,
  }).lineTotalExclVatCents;
}
