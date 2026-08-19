import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { DocumentType } from '../../../generated/prisma/enums';
import { CreateInvoiceDto } from './create-invoice.dto';

// Phase 1.1-3: depositPercentageBasisPoints/depositAmountCents are both
// nullable columns (schema.prisma), but this app never has a meaningful use
// for one without the other — the PDF always prints them together ("Acompte
// demandé : 30 % soit 450,00 €"). Lives on depositAmountCents, the field
// whose presence decides whether a deposit was actually requested. Never
// set on a DEVIS — a quote isn't something a client pays a deposit against
// yet, matching InvoiceStatus's existing FACTURE-only scope.
export function DepositFieldsConsistency(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'depositFieldsConsistency',
      target: object.constructor,
      propertyName,
      options: {
        message:
          'depositPercentageBasisPoints and depositAmountCents must be set together, and only for a FACTURE',
        ...options,
      },
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const dto = args.object as CreateInvoiceDto;
          const amountCents = value as number | undefined;
          const hasAmount = amountCents !== undefined;
          const hasPercentage = dto.depositPercentageBasisPoints !== undefined;
          if (hasAmount !== hasPercentage) {
            return false;
          }
          if (hasAmount && (dto.documentType ?? DocumentType.FACTURE) !== DocumentType.FACTURE) {
            return false;
          }
          return true;
        },
      },
    });
  };
}
