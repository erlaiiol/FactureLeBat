// Bumped whenever the CGU/politique de confidentialité text changes in a
// way that requires re-consent — see User.termsVersion.
export const CURRENT_TERMS_VERSION = '1.0';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';
// Must match the cookie name Angular's HttpClient XSRF interceptor reads by
// default (withXsrfConfiguration({ cookieName: 'XSRF-TOKEN', headerName:
// 'X-XSRF-TOKEN' }) in frontend/src/app/app.config.ts).
export const XSRF_COOKIE = 'XSRF-TOKEN';
export const XSRF_HEADER = 'X-XSRF-TOKEN';

// Scoped tighter than the access-token cookie: the refresh token is only
// ever needed by /api/auth/refresh and /api/auth/logout, so there is no
// reason for it to be sent on every other API call.
export const REFRESH_TOKEN_COOKIE_PATH = '/api/auth';

export const BCRYPT_SALT_ROUNDS = 12;

export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
