import { HttpErrorResponse } from '@angular/common/http';
import { TimeoutError } from 'rxjs';

// A `status` of 0 means the browser/WKWebView never got any response at
// all — no wifi/4G, DNS failure, connection refused — categorically
// different from any real HTTP status the server actually sent back (401,
// 404, 500, ...). timeout.interceptor.ts's own rxjs TimeoutError (a request
// that never resolves within its deadline, e.g. a flaky connection that
// connects but never finishes) is the same practical symptom from the
// artisan's point of view, so it counts too. Used by authGuard/guestGuard
// to send a cold app launch with no connectivity to OfflinePage instead of
// silently reading a failed `/auth/me` as "not logged in" and showing the
// login form — misleading when the artisan might have a perfectly valid
// session and just no signal.
export function isNetworkError(error: unknown): boolean {
  if (error instanceof HttpErrorResponse) {
    return error.status === 0;
  }
  return error instanceof TimeoutError;
}
