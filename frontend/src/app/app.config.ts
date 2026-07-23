import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { authRefreshInterceptor } from './core/interceptors/auth-refresh.interceptor';
import { credentialsInterceptor } from './core/interceptors/credentials.interceptor';
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
    provideHttpClient(
      withFetch(),
      withInterceptors([credentialsInterceptor, xsrfInterceptor, authRefreshInterceptor]),
    ),
  ],
};
