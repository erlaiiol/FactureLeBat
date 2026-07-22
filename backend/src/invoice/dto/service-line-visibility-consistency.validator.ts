import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { ServiceVisibility } from '../../../generated/prisma/enums';
import { CreateInvoiceServiceLineDto } from './create-invoice-service-line.dto';
import { RedistributionStrategy } from './redistribution-strategy.enum';

// A VISIBLE service line has nothing to redistribute, so it must not carry
// a strategy or weights. A REDISTRIBUTED one always needs a strategy;
// weights only make sense (and are only required) for WEIGHTED — EQUAL is
// implicit (see RedistributionStrategy). This only checks internal
// consistency of a single service line; matching WEIGHTED weights against
// the invoice's actual line count is a separate, invoice-level check (see
// ServiceLineWeightsMatchLines), since a single line DTO has no visibility
// into its siblings.
export function ServiceLineVisibilityConsistency(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'serviceLineVisibilityConsistency',
      target: object.constructor,
      propertyName,
      options: {
        message:
          'redistributionStrategy/weights must be omitted when visibility is VISIBLE; redistributionStrategy is required when visibility is REDISTRIBUTED, and weights are required (and only allowed) for the WEIGHTED strategy',
        ...options,
      },
      validator: {
        validate(_value: unknown, args: ValidationArguments) {
          const line = args.object as CreateInvoiceServiceLineDto;

          if (line.visibility === ServiceVisibility.VISIBLE) {
            return line.redistributionStrategy === undefined && line.weights === undefined;
          }

          if (line.redistributionStrategy === undefined) {
            return false;
          }
          if (line.redistributionStrategy === RedistributionStrategy.WEIGHTED) {
            return Array.isArray(line.weights) && line.weights.length > 0;
          }
          // EQUAL: weights are implicit, an explicit array would be ambiguous
          // (is it meant to override the equal split?) so it's rejected.
          return line.weights === undefined;
        },
      },
    });
  };
}
