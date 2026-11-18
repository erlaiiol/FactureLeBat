import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { InvoiceEntryMode, ServiceVisibility } from '../../../generated/prisma/enums';
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
          'entryMode GUIDED requires at least one line (or only VISIBLE service lines), no manualTable, and no totals/VAT/nature-of-operation override; entryMode MANUAL requires a manualTable and no lines/serviceLines/discountLines',
        ...options,
      },
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const dto = args.object as CreateInvoiceDto;
          const entryMode = (value as InvoiceEntryMode | undefined) ?? InvoiceEntryMode.GUIDED;

          if (entryMode === InvoiceEntryMode.GUIDED) {
            const serviceLines = dto.serviceLines ?? [];
            // A services-only invoice (e.g. pure main-d'œuvre) is legitimate
            // as long as every service line stands as its own VISIBLE line —
            // a REDISTRIBUTED one needs product lines to fold into (EQUAL
            // would otherwise expand to zero weights and crash
            // computeWeightedSplit).
            const hasBillableContent =
              (dto.lines?.length ?? 0) > 0 ||
              (serviceLines.length > 0 &&
                serviceLines.every((line) => line.visibility === ServiceVisibility.VISIBLE));
            return (
              hasBillableContent &&
              !dto.manualTable &&
              dto.subtotalOverrideCents === undefined &&
              dto.vatOverrideCents === undefined &&
              dto.totalOverrideCents === undefined &&
              dto.vatApplicableOverride === undefined &&
              dto.vatRateBasisPointsOverride === undefined &&
              // Phase 1.1-8: GUIDED derives "nature de l'opération" from its
              // own lines/serviceLines at PDF-render time — never a
              // GUIDED-side input, same reasoning as the VAT overrides above.
              dto.manualNatureOfOperation === undefined
            );
          }

          return (
            !!dto.manualTable &&
            !(dto.lines && dto.lines.length > 0) &&
            !(dto.serviceLines && dto.serviceLines.length > 0) &&
            !(dto.discountLines && dto.discountLines.length > 0)
          );
        },
      },
    });
  };
}
