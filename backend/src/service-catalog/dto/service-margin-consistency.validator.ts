import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { MarginMode, ServicePricingMode } from '../../../generated/prisma/enums';
import { CreateServiceDto } from './create-service.dto';

// Phase 1.6: same shape as ProductMarginConsistency (see that file's
// comment for why this is deliberately NOT paired with
// @IsOptional()/@IsEnum() on marginMode), adapted for Service's own quirk —
// priceCents is only ever set for pricingMode FIXED (a PERCENTAGE-priced
// service has no fixed per-line price to bound a NET_AMOUNT margin against
// at save time, so the cap is skipped then; see
// docs/1.6/1.6-1-margin-data-model.md).
export function ServiceMarginConsistency(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'serviceMarginConsistency',
      target: object.constructor,
      propertyName,
      options: {
        message:
          'marginMode must be a valid MarginMode; marginAmountCents is required for NET_AMOUNT margin (and must not exceed priceCents, when priceCents is set), marginPercentageBasisPoints for PERCENTAGE margin — neither when marginMode is unset',
        ...options,
      },
      validator: {
        validate(_value: unknown, args: ValidationArguments) {
          const dto = args.object as CreateServiceDto;
          if (dto.marginMode == null) {
            return dto.marginAmountCents == null && dto.marginPercentageBasisPoints == null;
          }
          if (!Object.values(MarginMode).includes(dto.marginMode)) {
            return false;
          }
          if (dto.marginMode === MarginMode.PERCENTAGE) {
            return dto.marginPercentageBasisPoints != null && dto.marginAmountCents == null;
          }
          if (dto.marginAmountCents == null || dto.marginPercentageBasisPoints != null) {
            return false;
          }
          if (dto.pricingMode === ServicePricingMode.FIXED && dto.priceCents != null) {
            return dto.marginAmountCents <= dto.priceCents;
          }
          return true;
        },
      },
    });
  };
}
