import { HttpInterceptorFn } from '@angular/common/http';
import { timeout } from 'rxjs';
import { environment } from '../../../environments/environment';

const DEFAULT_TIMEOUT_MS = 20_000;

// Product-import scraping and sourcing search do real external work
// server-side — see the backend's own REQUEST_TIMEOUT_MS in
// safe-fetcher.service.ts (8s to fetch the supplier page) and
// groq-client.service.ts (25s for the LLM call), each with parsing/DB work
// on top. This stays comfortably above the slower of the two so the client
// never times out a request the backend was always going to finish.
const LONG_TIMEOUT_PATHS = ['/products/import', '/sourcing/'];
const LONG_TIMEOUT_MS = 40_000;

// Without this, a request that never gets a response at all — backend
// process wedged, connection accepted then silently dropped by a proxy —
// hangs the calling page forever: no success, no error, spinner stuck,
// nothing for the artisan to act on and nothing for a toast to report. This
// turns "no response ever arrives" into a genuine HttpErrorResponse-like
// failure (a rxjs TimeoutError) once the deadline passes, so it flows
// through the exact same error/toast handling as any other failed request
// instead of hanging silently. Placed first in app.config.ts's interceptor
// chain so the deadline covers the whole request lifecycle as the caller
// sees it, including authRefreshInterceptor's internal 401-refresh-and-retry
// — one ceiling on "this settles or fails within N ms", not one per attempt.
export const timeoutInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiBaseUrl)) {
    return next(req);
  }
  const isLongRunning = LONG_TIMEOUT_PATHS.some((path) => req.url.includes(path));
  return next(req).pipe(timeout(isLongRunning ? LONG_TIMEOUT_MS : DEFAULT_TIMEOUT_MS));
};
