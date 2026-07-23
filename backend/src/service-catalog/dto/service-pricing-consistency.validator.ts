import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { ServicePricingMode } from '../../../generated/prisma/enums';
import { CreateServiceDto } from './create-service.dto';

// Phase 13.5: exactly one of priceCents/percentageBasisPoints is meaningful,
// depending on pricingMode — same "cross-field consistency enforced at the
// DTO boundary, not the DB" pattern as WasteSurchargeOnlyForArea.
export function ServicePricingConsistency(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'servicePricingConsistency',
      target: object.constructor,
      propertyName,
      options: {
        message:
          'priceCents is required for FIXED pricing, percentageBasisPoints for PERCENTAGE pricing — never both',
        ...options,
      },
      validator: {
        validate(_value: unknown, args: ValidationArguments) {
          const dto = args.object as CreateServiceDto;
          if (dto.pricingMode === ServicePricingMode.PERCENTAGE) {
            return dto.percentageBasisPoints != null && dto.priceCents == null;
          }
          return dto.priceCents != null && dto.percentageBasisPoints == null;
        },
      },
    });
  };
}
