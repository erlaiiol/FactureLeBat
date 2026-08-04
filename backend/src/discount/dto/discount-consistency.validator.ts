import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { DiscountType } from '../../../generated/prisma/enums';
import { CreateDiscountDto } from './create-discount.dto';

// Phase 32: exactly one of fixedAmountCents/percentageBasisPoints is
// meaningful, depending on discountType — same "cross-field consistency
// enforced at the DTO boundary, not the DB" pattern as ServicePricingConsistency.
export function DiscountConsistency(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'discountConsistency',
      target: object.constructor,
      propertyName,
      options: {
        message:
          'fixedAmountCents is required for FIXED discounts, percentageBasisPoints for PERCENTAGE discounts — never both',
        ...options,
      },
      validator: {
        validate(_value: unknown, args: ValidationArguments) {
          const dto = args.object as CreateDiscountDto;
          if (dto.discountType === DiscountType.PERCENTAGE) {
            return dto.percentageBasisPoints != null && dto.fixedAmountCents == null;
          }
          return dto.fixedAmountCents != null && dto.percentageBasisPoints == null;
        },
      },
    });
  };
}
