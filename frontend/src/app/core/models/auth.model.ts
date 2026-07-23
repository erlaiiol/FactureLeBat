export type UserRole = 'ARTISAN' | 'ADMIN';

// Mirrors the backend's PublicUser (auth/entities/public-user.entity.ts) —
// never a password, never raw token material (tokens travel as httpOnly
// cookies, never in a response body).
export interface PublicUser {
  id: string;
  email: string;
  role: UserRole;
  companyId: string;
  emailVerified: boolean;
  newsletterOptIn?: boolean;
}

export interface RegisterRequest {
  email: string;
  password: string;
  acceptTerms: boolean;
  newsletterOptIn?: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}
