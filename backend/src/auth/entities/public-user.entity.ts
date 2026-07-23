import { UserRole } from '../../../generated/prisma/enums';

// The only user shape ever returned to a client — never passwordHash,
// googleId, or raw token material. Returned by register/login/refresh/the
// Google callback (as the response body's precursor — the actual tokens
// travel as httpOnly cookies, never in this JSON).
export interface PublicUser {
  id: string;
  email: string;
  role: UserRole;
  companyId: string;
  emailVerified: boolean;
  newsletterOptIn: boolean;
}
