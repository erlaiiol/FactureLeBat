import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { CreateInvoiceDiscountLineDto } from './create-invoice-discount-line.dto';
import { CreateInvoiceDto } from './create-invoice.dto';

// Phase 34: a discount line's targetLineIndex/targetServiceLineIndex are
// positional, aligned with the invoice's own `lines`/`serviceLines` arrays
// (same convention as a WEIGHTED service line's weights[i]) — so validating
// them requires those sibling fields, which a single
// CreateInvoiceDiscountLineDto has no visibility into. Lives on
// CreateInvoiceDto instead, same reasoning as ServiceLineWeightsMatchLines.
export function DiscountTargetMatchesLines(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'discountTargetMatchesLines',
      target: object.constructor,
      propertyName,
      options: {
        message:
          "a discount line can target at most one of a specific line or service line, each a valid index into the invoice's own lines/serviceLines",
        ...options,
      },
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const dto = args.object as CreateInvoiceDto;
          const lineCount = dto.lines?.length ?? 0;
          const serviceLineCount = dto.serviceLines?.length ?? 0;
          const discountLines = (value as CreateInvoiceDiscountLineDto[] | undefined) ?? [];

          return discountLines.every((discountLine) => {
            const hasLineTarget = discountLine.targetLineIndex !== undefined;
            const hasServiceLineTarget = discountLine.targetServiceLineIndex !== undefined;
            if (hasLineTarget && hasServiceLineTarget) {
              return false;
            }
            if (hasLineTarget) {
              return (
                Number.isInteger(discountLine.targetLineIndex) &&
                discountLine.targetLineIndex! >= 0 &&
                discountLine.targetLineIndex! < lineCount
              );
            }
            if (hasServiceLineTarget) {
              return (
                Number.isInteger(discountLine.targetServiceLineIndex) &&
                discountLine.targetServiceLineIndex! >= 0 &&
                discountLine.targetServiceLineIndex! < serviceLineCount
              );
            }
            return true;
          });
        },
      },
    });
  };
}
