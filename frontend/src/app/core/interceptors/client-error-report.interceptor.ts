import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError, TimeoutError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CLIENT_LOGS_PATH, ClientLogService } from '../services/client-log.service';

// Reports the API failures the server can't see or can't explain on its
// own — status 0 (never reached it: offline, TLS, CORS), a client-side
// timeout (the request may still be running server-side, now logged there
// as ABORTED), and 5xx — to ClientLogService. 4xx are left alone: the
// server already logs every one of those, now with the caller's userId.
//
// Outermost in app.config.ts's chain (before timeoutInterceptor) so it sees
// the final outcome the calling page sees, timeout included.
export const clientErrorReportInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiBaseUrl) || req.url.includes(CLIENT_LOGS_PATH)) {
    return next(req);
  }
  const clientLog = inject(ClientLogService);
  const startedAt = Date.now();

  return next(req).pipe(
    catchError((error: unknown) => {
      const report = describeFailure(error);
      if (report) {
        clientLog.report({
          kind: 'http_error',
          method: req.method,
          url: req.url.slice(environment.apiBaseUrl.length).split('?')[0],
          durationMs: Date.now() - startedAt,
          ...report,
        });
      }
      return throwError(() => error);
    }),
  );
};

function describeFailure(
  error: unknown,
): { status: number; message: string; requestId?: string } | null {
  if (error instanceof TimeoutError) {
    return { status: 0, message: 'Client timeout' };
  }
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }
  if (error.status === 0) {
    const online = typeof navigator === 'undefined' || navigator.onLine;
    return { status: 0, message: online ? 'Network error' : 'Network error (offline)' };
  }
  if (error.status >= 500) {
    return {
      status: error.status,
      message: error.statusText,
      requestId: error.headers?.get('x-request-id') ?? undefined,
    };
  }
  return null;
}
