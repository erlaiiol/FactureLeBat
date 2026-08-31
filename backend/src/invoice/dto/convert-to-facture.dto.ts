import {
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
  registerDecorator,
  ValidationArguments,
} from 'class-validator';
import { SimplifiedDisplayLevel } from '../../../generated/prisma/enums';

// No real invoice needs an override past this — same bound as
// CreateInvoiceDto's MAX_OVERRIDE_CENTS.
const MAX_OVERRIDE_CENTS = 100_000_000;

// Same "both or neither" pairing as CreateInvoiceDto's
// DepositFieldsConsistency, minus the FACTURE-only branch (this DTO is
// always FACTURE-only by construction — it only ever reaches
// InvoiceService.convertToFacture).
function ConvertDepositFieldsConsistency() {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'convertDepositFieldsConsistency',
      target: object.constructor,
      propertyName,
      options: {
        message: 'depositPercentageBasisPoints and depositAmountCents must be set together',
      },
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const dto = args.object as ConvertToFactureDto;
          const hasAmount = (value as number | undefined) !== undefined;
          const hasPercentage = dto.depositPercentageBasisPoints !== undefined;
          return hasAmount === hasPercentage;
        },
      },
    });
  };
}

// "Facture identique" from the invoice board's conversion modal
// (InvoiceBoardPage.convertDevis): every field otherwise carries through
// from the devis untouched (InvoiceService.convertToFacture), but the
// artisan can override the display mode or note a deposit right there
// before the clone is created, without going through the full editable
// wizard.
export class ConvertToFactureDto {
  @IsOptional()
  @IsEnum(SimplifiedDisplayLevel)
  simplifiedDisplay?: SimplifiedDisplayLevel;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  depositPercentageBasisPoints?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_OVERRIDE_CENTS)
  @ConvertDepositFieldsConsistency()
  depositAmountCents?: number;
}
