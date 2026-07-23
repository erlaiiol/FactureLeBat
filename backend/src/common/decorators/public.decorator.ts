import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Marks a route as exempt from the global JwtAuthGuard (auth/guards/jwt-auth.guard.ts) —
// registration, login, token refresh, the Google OAuth redirect/callback,
// password-reset/email-verification links, and the health check.
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
