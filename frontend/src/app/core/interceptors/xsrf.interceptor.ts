import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

const XSRF_COOKIE_NAME = 'XSRF-TOKEN';
const XSRF_HEADER_NAME = 'X-XSRF-TOKEN';
const SAFE_METHODS = new Set(['GET', 'HEAD']);

function readXsrfCookie(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${XSRF_COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// Angular's own built-in withXsrfConfiguration() refuses to attach the
// header cross-origin (it compares location.origin to the request's origin
// and silently no-ops otherwise — see xsrfInterceptorFn in
// @angular/common/http), which breaks CsrfGuard's double-submit check in
// dev, where the frontend (localhost:4200) and API (localhost:3000) are
// different origins even though they're both "ours" — every mutating call
// would 403. This reimplements the same double-submit mechanic without
// that same-origin restriction; scoping cookie exposure to our own API is
// already credentialsInterceptor's job (withCredentials), not this one's.
export const xsrfInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiBaseUrl) || SAFE_METHODS.has(req.method)) {
    return next(req);
  }
  const token = readXsrfCookie();
  if (!token || req.headers.has(XSRF_HEADER_NAME)) {
    return next(req);
  }
  return next(req.clone({ headers: req.headers.set(XSRF_HEADER_NAME, token) }));
};
