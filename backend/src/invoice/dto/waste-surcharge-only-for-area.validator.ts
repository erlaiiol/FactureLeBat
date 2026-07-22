import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { CreateInvoiceLineDto } from './create-invoice-line.dto';

// UNIT mode has no notion of offcut waste — enforce that a UNIT line never
// carries a non-NONE waste surcharge, instead of silently ignoring it.
export function WasteSurchargeOnlyForArea(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'wasteSurchargeOnlyForArea',
      target: object.constructor,
      propertyName,
      options: {
        message: 'wasteSurcharge must be NONE when mode is UNIT',
        ...options,
      },
      validator: {
        validate(value: string, args: ValidationArguments) {
          const line = args.object as CreateInvoiceLineDto;
          return line.mode === 'AREA' || value === 'NONE';
        },
      },
    });
  };
}
