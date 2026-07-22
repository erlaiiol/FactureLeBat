import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { isAreaUnit } from '../../common/unit.util';
import { CreateInvoiceLineDto } from './create-invoice-line.dto';

// A non-square-meter unit has no notion of offcut waste — enforce that such
// a line never carries a non-NONE waste surcharge, instead of silently
// ignoring it. The calculation mode itself (Phase 7) is derived from the
// chosen unit, not a separate client-supplied field.
export function WasteSurchargeOnlyForArea(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'wasteSurchargeOnlyForArea',
      target: object.constructor,
      propertyName,
      options: {
        message: 'wasteSurcharge must be NONE unless unit is SQUARE_METER',
        ...options,
      },
      validator: {
        validate(value: string, args: ValidationArguments) {
          const line = args.object as CreateInvoiceLineDto;
          return isAreaUnit(line.unit) || value === 'NONE';
        },
      },
    });
  };
}
