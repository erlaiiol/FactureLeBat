import { Request, Response } from 'express';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE_PATH,
  XSRF_COOKIE,
} from './auth.constants';
import { IssuedTokens } from './auth.service';

// The iOS app's WKWebView can never actually run under an `https://` origin
// — WKWebView reserves that scheme for its own native handling and silently
// falls back to `capacitor://<hostname>` regardless of capacitor.config.ts's
// iosScheme setting (see CAPInstanceDescriptor.swift's normalize(), and
// frontend/src/environments/environment.prod.ts's resolveApiBaseUrl for the
// matching frontend-side fix: the app calls the API by absolute URL instead
// of relying on a same-origin relative path that doesn't actually hold on
// iOS). That makes every request from the app genuinely cross-site, and a
// cross-site fetch/XHR never attaches a `sameSite: 'lax'` cookie — only this
// one case needs 'none' to get a session at all. The web app (and Android,
// whose WebView CAN genuinely serve under `https://`, unlike iOS's) stay
// 'lax', their real CSRF protection, since their requests are genuinely
// same-site. A forged `Origin: capacitor://...` header can't come from a
// real browser context — only a real Capacitor iOS WKWebView can present
// one — so trusting the header here doesn't weaken anything: the request
// still can't succeed at all unless CORS_ORIGIN also explicitly allows it.
function sameSiteFor(req: Request): 'lax' | 'none' {
  return req.headers.origin?.startsWith('capacitor://') ? 'none' : 'lax';
}

// Sets the three cookies a successful register/login/refresh/Google-callback
// issues. isProduction gates `secure` — httpOnly cookies still need a real
// TLS connection to be sent once secure=true (see docs/deployment.md's
// Caddy-terminated-TLS topology, which is what makes secure=true safe in
// prod without breaking local http://localhost dev). sameSite=none (see
// sameSiteFor above) additionally requires secure=true per spec — already
// the case for the one origin that needs it, since the iOS app only ever
// talks to the real https:// production API, never the http:// dev one.
export function setAuthCookies(
  req: Request,
  res: Response,
  tokens: IssuedTokens,
  isProduction: boolean,
): void {
  const sameSite = sameSiteFor(req);
  const base = { httpOnly: true, secure: isProduction, sameSite };

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
    sameSite,
    path: '/',
  });
}

export function clearAuthCookies(req: Request, res: Response, isProduction: boolean): void {
  const sameSite = sameSiteFor(req);
  res.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/api' });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { path: REFRESH_TOKEN_COOKIE_PATH });
  res.clearCookie(XSRF_COOKIE, { path: '/', secure: isProduction, sameSite });
}
