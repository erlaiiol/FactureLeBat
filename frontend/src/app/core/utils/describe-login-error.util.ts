import { HttpErrorResponse } from '@angular/common/http';

// Native login failures (Google's/Apple's own plugins, and HttpErrorResponse
// from the backend call that follows) are plain objects, not Error
// instances — `String(error)` on those gives the useless "[object Object]"
// instead of the code/message that actually explains the failure, which is
// the one clue closed-beta testers without chrome://inspect can see. Shared
// by login.page.ts and register.page.ts's native Google/Apple handlers.
export function describeLoginError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    // error.message is only ever the generic "Http failure response for
    // <url>: <status>" — useless for a closed-beta tester with no console
    // access. Nest's exception filter puts the actual reason (e.g. "Jeton
    // Google invalide.") in the response body instead, as a string or, for
    // a class-validator failure, an array of strings.
    const body = error.error as { message?: unknown } | null;
    if (typeof body?.message === 'string') {
      return body.message;
    }
    if (Array.isArray(body?.message) && body.message.every((m) => typeof m === 'string')) {
      return body.message.join(', ');
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === 'object') {
    const { message, code } = error as { message?: unknown; code?: unknown };
    if (typeof message === 'string') {
      return code ? `${message} (${code})` : message;
    }
    try {
      return JSON.stringify(error);
    } catch {
      // Falls through to String(error) below — e.g. a circular structure.
    }
  }
  return String(error);
}
