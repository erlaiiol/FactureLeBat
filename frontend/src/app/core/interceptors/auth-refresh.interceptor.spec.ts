import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { authRefreshInterceptor } from './auth-refresh.interceptor';

const API = environment.apiBaseUrl;

function setup() {
  const router = {
    url: '/factures/nouvelle/rapide/apercu',
    navigate: vi.fn().mockResolvedValue(true),
    routerState: { snapshot: { root: { firstChild: null, data: {} } } },
  };
  const toast = { info: vi.fn(), error: vi.fn(), success: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authRefreshInterceptor])),
      provideHttpClientTesting(),
      { provide: Router, useValue: router },
      { provide: ToastService, useValue: toast },
    ],
  });
  const auth = TestBed.inject(AuthService);
  auth.currentUser.set({
    id: 'u_1',
    email: 'a@b.fr',
    role: 'USER' as never,
    companyId: 'c_1',
    emailVerified: true,
  });
  return {
    http: TestBed.inject(HttpClient),
    ctrl: TestBed.inject(HttpTestingController),
    auth,
    router,
    toast,
  };
}

describe('authRefreshInterceptor', () => {
  it('clears the local session before sending to /connexion when refresh fails', () => {
    const { http, ctrl, auth, router, toast } = setup();
    http.post(`${API}/invoices/preview-data`, {}).subscribe({ error: () => undefined });

    ctrl.expectOne(`${API}/invoices/preview-data`).flush(null, { status: 401, statusText: 'x' });
    ctrl.expectOne(`${API}/auth/refresh`).flush(null, { status: 401, statusText: 'x' });

    // Otherwise guestGuard bounces /connexion straight back into the app.
    expect(auth.currentUser()).toBeNull();
    expect(toast.info).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/connexion']);
  });

  it('keeps the session when the refresh only failed for lack of network', () => {
    const { http, ctrl, auth, router } = setup();
    let failure: unknown;
    http
      .post(`${API}/invoices/preview-data`, {})
      .subscribe({ error: (e: unknown) => (failure = e) });

    ctrl.expectOne(`${API}/invoices/preview-data`).flush(null, { status: 401, statusText: 'x' });
    ctrl.expectOne(`${API}/auth/refresh`).error(new ProgressEvent('error'));

    expect(auth.currentUser()).not.toBeNull();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(failure).toBeDefined();
  });
});
