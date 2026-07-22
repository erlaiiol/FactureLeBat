import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { InvoiceEntryMode } from '../../../generated/prisma/enums';
import { CreateInvoiceDto } from './create-invoice.dto';

// Manual mode (Phase 9.5) is an alternate input surface for the same
// Invoice, not a second invoicing engine running alongside the first — so
// exactly one of {lines (+ optional serviceLines), manualTable} may be
// present, decided by entryMode. Lives on entryMode itself, the field whose
// value decides which of its two siblings is required.
export function ManualModeFieldsConsistency(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'manualModeFieldsConsistency',
      target: object.constructor,
      propertyName,
      options: {
        message:
          'entryMode GUIDED requires at least one line and no manualTable; entryMode MANUAL requires a manualTable and no lines/serviceLines',
        ...options,
      },
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const dto = args.object as CreateInvoiceDto;
          const entryMode = (value as InvoiceEntryMode | undefined) ?? InvoiceEntryMode.GUIDED;

          if (entryMode === InvoiceEntryMode.GUIDED) {
            return (dto.lines?.length ?? 0) > 0 && !dto.manualTable;
          }

          return (
            !!dto.manualTable &&
            !(dto.lines && dto.lines.length > 0) &&
            !(dto.serviceLines && dto.serviceLines.length > 0)
          );
        },
      },
    });
  };
}
