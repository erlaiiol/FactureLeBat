import { UserRole } from '../../../generated/prisma/enums';

// The shape JwtStrategy.validate() returns and attaches to req.user — the
// same shape carried in the access-token JWT payload itself (see
// auth/auth.service.ts's issueTokens). Every tenant-scoped controller reads
// companyId from this via @CurrentUser(), never from a client-supplied id.
export interface AuthenticatedUser {
  userId: string;
  companyId: string;
  role: UserRole;
  email: string;
  emailVerified: boolean;
}
