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
  referralCode?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

// `make demo`'s one-click login — mirrors the backend's DEMO_PROFILES
// (auth/demo.constants.ts). Empty array from GET /auth/demo-profiles means
// DEMO_MODE is off on this deployment (the normal case), in which case the
// login page simply renders no quick-login section at all.
export interface DemoProfile {
  key: string;
  label: string;
}
