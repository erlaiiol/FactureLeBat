import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { authRefreshInterceptor } from './core/interceptors/auth-refresh.interceptor';
import { credentialsInterceptor } from './core/interceptors/credentials.interceptor';
import { premiumGateInterceptor } from './core/interceptors/premium-gate.interceptor';
import { timeoutInterceptor } from './core/interceptors/timeout.interceptor';
import { xsrfInterceptor } from './core/interceptors/xsrf.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Angular's own withXsrfConfiguration() is deliberately NOT used here —
    // it silently skips cross-origin requests (see xsrf.interceptor.ts),
    // which is exactly our dev topology (frontend :4200, API :3000).
    // xsrfInterceptor reimplements the same double-submit mechanic without
    // that restriction.
    // timeoutInterceptor goes first (outermost) so its deadline covers the
    // whole request as the caller sees it, including authRefreshInterceptor's
    // internal 401-refresh-and-retry dance further down the chain.
    provideHttpClient(
      withFetch(),
      withInterceptors([
        timeoutInterceptor,
        credentialsInterceptor,
        xsrfInterceptor,
        authRefreshInterceptor,
        premiumGateInterceptor,
      ]),
    ),
  ],
};
