import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { DocumentType } from '../../../generated/prisma/enums';
import { CreateInvoiceDto } from './create-invoice.dto';

// Phase 1.1-7: "Autoliquidation (sous-traitance BTP)" only ever makes sense
// on a facture — a devis is a quote, not yet a billable subcontracting
// relationship. Same FACTURE-only shape as DepositFieldsConsistency, but
// simpler: reverseChargeApplicable has no sibling field it must appear
// alongside, just a document-type constraint on itself.
export function ReverseChargeFactureOnly(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'reverseChargeFactureOnly',
      target: object.constructor,
      propertyName,
      options: {
        message: 'reverseChargeApplicable can only be set on a FACTURE',
        ...options,
      },
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const dto = args.object as CreateInvoiceDto;
          if (value !== true) {
            return true;
          }
          return (dto.documentType ?? DocumentType.FACTURE) === DocumentType.FACTURE;
        },
      },
    });
  };
}
