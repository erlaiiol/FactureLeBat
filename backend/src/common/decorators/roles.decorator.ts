import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/enums';

export const ROLES_KEY = 'roles';

// Scaffolded in Phase 13 for Phase 14's admin dashboard — unused until then.
// RolesGuard (auth/guards/roles.guard.ts) reads this metadata.
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
