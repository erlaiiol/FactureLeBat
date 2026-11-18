import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { computeManualRowTotalCents } from '../../manual/manual-table-calculation.util';
import { CreateManualRowDto } from './create-manual-row.dto';
import { CreateManualTableDto } from './create-manual-table.dto';

// Individual manual rows may be negative (a remise, or an acompte déjà versé
// deducted on the final invoice — see parseManualDecimalCell), but the sum
// of every row's LINE_TOTAL may not: a facture/devis whose lines net out
// below zero is really an avoir (credit note), a distinct legal document
// with its own numbering this app doesn't produce. Rejected here rather
// than floored at 0 in InvoiceMapper, since silently printing a total that
// doesn't match the lines would break manual mode's "nothing computed
// behind the artisan's back" principle. Same placement reasoning as
// ManualRowCellsValid: needs the sibling `columns` to find LINE_TOTAL.
// Runs after ManualRowCellsValid on the same property, and
// computeManualRowTotalCents treats an unparseable cell as 0, so a
// malformed row can't make this one throw — it just reports its own rule.
export function ManualRowsTotalNonNegative(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'manualRowsTotalNonNegative',
      target: object.constructor,
      propertyName,
      options: {
        message:
          'the sum of the manual rows cannot be negative — a negative document is a credit note (avoir), not an invoice',
        ...options,
      },
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const dto = args.object as CreateManualTableDto;
          const columns = dto.columns ?? [];
          const rows = (value as CreateManualRowDto[] | undefined) ?? [];
          const sumCents = rows.reduce(
            (sum, row) => sum + computeManualRowTotalCents(columns, row.cells ?? []),
            0,
          );
          return sumCents >= 0;
        },
      },
    });
  };
}
