import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ClientInfoService } from '../services/client-info.service';

// Tags every API call with the shell + build it came from — logged
// server-side next to userId by http-logging.middleware.ts, so a single
// artisan's requests can be traced (and an outdated build spotted) from the
// logs alone. Informational only: the backend never trusts these.
export const clientInfoInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiBaseUrl)) {
    return next(req);
  }
  const clientInfo = inject(ClientInfoService);
  let headers = req.headers.set('X-App-Platform', clientInfo.platform);
  const version = clientInfo.appVersion;
  if (version) {
    headers = headers.set('X-App-Version', version);
  }
  return next(req.clone({ headers }));
};
