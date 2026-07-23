import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

// Every request to our own API must carry the httpOnly auth/XSRF cookies —
// withCredentials defaults to false, and without it the browser silently
// drops both the cookies on the request and any Set-Cookie on the
// response. Centralized here so none of the existing core/services/*.ts
// HttpClient wrappers (written before Phase 13) had to be touched
// individually.
export const credentialsInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiBaseUrl)) {
    return next(req);
  }
  return next(req.clone({ withCredentials: true }));
};
