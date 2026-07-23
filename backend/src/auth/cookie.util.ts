import { Response } from 'express';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE_PATH,
  XSRF_COOKIE,
} from './auth.constants';
import { IssuedTokens } from './auth.service';

// Sets the three cookies a successful register/login/refresh/Google-callback
// issues. isProduction gates `secure` — httpOnly cookies still need a real
// TLS connection to be sent once secure=true (see docs/deployment.md's
// Caddy-terminated-TLS topology, which is what makes secure=true safe in
// prod without breaking local http://localhost dev).
export function setAuthCookies(res: Response, tokens: IssuedTokens, isProduction: boolean): void {
  const base = { httpOnly: true, secure: isProduction, sameSite: 'lax' as const };

  // Session cookie (no maxAge/expires): the JWT's own `exp` claim is what
  // JwtStrategy actually enforces server-side, so there is no security
  // reason to also cap the cookie's browser-side lifetime — avoids
  // duplicating/hardcoding JWT_ACCESS_EXPIRES_IN's value here.
  res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, { ...base, path: '/api' });

  res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    ...base,
    path: REFRESH_TOKEN_COOKIE_PATH,
    // No `expires` at all for a non-remembered session: omitting it makes
    // this a browser session cookie, cleared on browser close — the "belt"
    // half of remember-me's belt-and-suspenders (the "suspenders" half is
    // the short server-side expiresAt AuthService already enforces).
    ...(tokens.rememberMe ? { expires: tokens.refreshExpiresAt } : {}),
  });

  // Deliberately NOT httpOnly — the frontend's xsrf.interceptor.ts reads
  // this via document.cookie to echo it back as a header (double-submit
  // CSRF defense, see CsrfGuard). path: '/' (not '/api' like the other two
  // cookies) is required, not cosmetic: a cookie's Path also gates
  // document.cookie *readability* from whatever page the browser is
  // currently on, not just which requests it's attached to — the SPA's own
  // pages live at paths like /factures/nouvelle, never under /api, so an
  // '/api'-scoped cookie would be sent to the backend just fine but stay
  // invisible to the frontend's own JS.
  res.cookie(XSRF_COOKIE, tokens.xsrfToken, {
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  });
}

export function clearAuthCookies(res: Response, isProduction: boolean): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/api' });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { path: REFRESH_TOKEN_COOKIE_PATH });
  res.clearCookie(XSRF_COOKIE, { path: '/', secure: isProduction, sameSite: 'lax' });
}
