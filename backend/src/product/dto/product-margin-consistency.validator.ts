import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { MarginMode } from '../../../generated/prisma/enums';
import { CreateProductDto } from './create-product.dto';

// Phase 1.6: exactly one of marginAmountCents/marginPercentageBasisPoints is
// meaningful, depending on marginMode — same "cross-field consistency
// enforced at the DTO boundary, not the DB" pattern as
// ServicePricingConsistency/DiscountConsistency. Unlike those, marginMode
// itself is optional (unset = "not declared," not a third mode) — so this
// validator is deliberately NOT paired with @IsOptional()/@IsEnum() on
// marginMode: class-validator's @IsOptional() skips every validator
// (including this one) on its own property once that property is
// null/undefined, which would silently stop enforcing "marginAmountCents
// must be unset when marginMode is unset" exactly when marginMode is
// unset. This validator does its own enum-membership check instead, so it
// always runs. priceCents is always present on a Product (unlike a
// PERCENTAGE-priced Service), so the per-unit cap always applies here.
export function ProductMarginConsistency(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'productMarginConsistency',
      target: object.constructor,
      propertyName,
      options: {
        message:
          'marginMode must be a valid MarginMode; marginAmountCents is required for NET_AMOUNT margin (and must not exceed priceCents), marginPercentageBasisPoints for PERCENTAGE margin — neither when marginMode is unset',
        ...options,
      },
      validator: {
        validate(_value: unknown, args: ValidationArguments) {
          const dto = args.object as CreateProductDto;
          if (dto.marginMode == null) {
            return dto.marginAmountCents == null && dto.marginPercentageBasisPoints == null;
          }
          if (!Object.values(MarginMode).includes(dto.marginMode)) {
            return false;
          }
          if (dto.marginMode === MarginMode.PERCENTAGE) {
            return dto.marginPercentageBasisPoints != null && dto.marginAmountCents == null;
          }
          return (
            dto.marginAmountCents != null &&
            dto.marginPercentageBasisPoints == null &&
            dto.marginAmountCents <= dto.priceCents
          );
        },
      },
    });
  };
}
