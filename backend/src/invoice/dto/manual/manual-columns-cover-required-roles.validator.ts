import { registerDecorator, ValidationOptions } from 'class-validator';
import { ManualColumnRole } from '../../../../generated/prisma/enums';
import { CreateManualColumnDto } from './create-manual-column.dto';

// A manual invoice's calculation (computeManualRowTotalCents) needs to find
// exactly one LINE_TOTAL column to price each row against — the artisan's own
// freehand row price, never derived from QUANTITY x UNIT_PRICE (see
// ManualColumnRole in schema.prisma). DESCRIPTION, QUANTITY, and UNIT_PRICE
// are still required-singleton columns so the canvas/PDF always has a
// sensible label and context, even though the latter two no longer feed the
// calculation directly. CUSTOM columns are unrestricted (zero or more,
// purely informational text, see docs/roadmap.md Phase 9.5).
const REQUIRED_SINGLE_ROLES: ManualColumnRole[] = [
  ManualColumnRole.DESCRIPTION,
  ManualColumnRole.QUANTITY,
  ManualColumnRole.UNIT_PRICE,
  ManualColumnRole.LINE_TOTAL,
];

export function ManualColumnsCoverRequiredRoles(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'manualColumnsCoverRequiredRoles',
      target: object.constructor,
      propertyName,
      options: {
        message:
          'manual table columns must contain exactly one DESCRIPTION, one QUANTITY, one UNIT_PRICE, and one LINE_TOTAL column',
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
