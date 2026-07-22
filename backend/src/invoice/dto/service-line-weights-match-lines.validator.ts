import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { ServiceVisibility } from '../../../generated/prisma/enums';
import { CreateInvoiceDto } from './create-invoice.dto';
import { CreateInvoiceServiceLineDto } from './create-invoice-service-line.dto';
import { RedistributionStrategy } from './redistribution-strategy.enum';

// A WEIGHTED service line's weights are positional, aligned with the
// invoice's own `lines` array (weights[i] applies to lines[i]) — so
// validating them requires the sibling `lines` field, which a single
// CreateInvoiceServiceLineDto has no visibility into (see
// ServiceLineVisibilityConsistency for what that one *can* check on its
// own). This lives on CreateInvoiceDto instead, where both fields are
// available via ValidationArguments.object.
export function ServiceLineWeightsMatchLines(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'serviceLineWeightsMatchLines',
      target: object.constructor,
      propertyName,
      options: {
        message:
          'each WEIGHTED service line must supply exactly one non-negative integer weight per invoice line, summing to more than zero',
        ...options,
      },
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const dto = args.object as CreateInvoiceDto;
          const lineCount = dto.lines?.length ?? 0;
          const serviceLines = (value as CreateInvoiceServiceLineDto[] | undefined) ?? [];

          return serviceLines.every((line) => {
            if (
              line.visibility !== ServiceVisibility.REDISTRIBUTED ||
              line.redistributionStrategy !== RedistributionStrategy.WEIGHTED
            ) {
              return true;
            }
            const weights = line.weights ?? [];
            if (weights.length !== lineCount) {
              return false;
            }
            if (!weights.every((weight) => Number.isInteger(weight) && weight >= 0)) {
              return false;
            }
            return weights.reduce((sum, weight) => sum + weight, 0) > 0;
          });
        },
      },
    });
  };
}
