import { registerDecorator, ValidationOptions } from 'class-validator';
import { ManualColumnRole } from '../../../../generated/prisma/enums';
import { CreateManualColumnDto } from './create-manual-column.dto';

// A manual invoice's calculation (computeManualRowTotalCents) needs to find
// exactly one QUANTITY and one UNIT_PRICE column to price each row against —
// and exactly one DESCRIPTION column for the canvas/PDF to render a sensible
// label. CUSTOM columns are unrestricted (zero or more, purely informational
// text, see docs/roadmap.md Phase 9.5).
const REQUIRED_SINGLE_ROLES: ManualColumnRole[] = [
  ManualColumnRole.DESCRIPTION,
  ManualColumnRole.QUANTITY,
  ManualColumnRole.UNIT_PRICE,
];

export function ManualColumnsCoverRequiredRoles(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'manualColumnsCoverRequiredRoles',
      target: object.constructor,
      propertyName,
      options: {
        message:
          'manual table columns must contain exactly one DESCRIPTION, one QUANTITY, and one UNIT_PRICE column',
        ...options,
      },
      validator: {
        validate(value: unknown) {
          const columns = (value as CreateManualColumnDto[] | undefined) ?? [];
          return REQUIRED_SINGLE_ROLES.every(
            (role) => columns.filter((column) => column.role === role).length === 1,
          );
        },
      },
    });
  };
}
