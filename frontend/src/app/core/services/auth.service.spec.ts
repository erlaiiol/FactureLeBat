import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { PublicUser } from '../models/auth.model';
import { AuthService } from './auth.service';
import { SESSION_EPOCH } from './session-epoch';
import { ToastService } from './toast.service';

const AUTH = `${environment.apiBaseUrl}/auth`;
const EPOCH_KEY = 'fl.sessionEpoch';
const USER = {
  id: 'u_1',
  email: 'a@b.fr',
  role: 'USER',
  companyId: 'c_1',
  emailVerified: true,
} as unknown as PublicUser;

function setup() {
  const toast = { info: vi.fn(), error: vi.fn(), success: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ToastService, useValue: toast },
    ],
  });
  return {
    auth: TestBed.inject(AuthService),
    ctrl: TestBed.inject(HttpTestingController),
    toast,
  };
}

describe('AuthService — forced re-login after an app update (session epoch)', () => {
  beforeEach(() => localStorage.clear());

  it('logs out a session from an older epoch and resolves to "not logged in"', () => {
    localStorage.setItem(EPOCH_KEY, String(SESSION_EPOCH - 1));
    const { auth, ctrl, toast } = setup();
    let result: PublicUser | null | undefined;
    auth.ensureLoaded().subscribe((user) => (result = user));

    ctrl.expectOne(`${AUTH}/me`).flush(USER);
    ctrl.expectOne(`${AUTH}/logout`).flush(null, { status: 204, statusText: 'No Content' });

    expect(result).toBeNull();
    expect(auth.currentUser()).toBeNull();
    expect(toast.info).toHaveBeenCalledOnce();
    expect(localStorage.getItem(EPOCH_KEY)).toBe(String(SESSION_EPOCH));
  });

  it('treats a device with no stored epoch as current (rollout must not log everyone out)', () => {
    const { auth, ctrl, toast } = setup();
    let result: PublicUser | null | undefined;
    auth.ensureLoaded().subscribe((user) => (result = user));

    ctrl.expectOne(`${AUTH}/me`).flush(USER);
    ctrl.expectNone(`${AUTH}/logout`);

    expect(result).toEqual(USER);
    expect(toast.info).not.toHaveBeenCalled();
    expect(localStorage.getItem(EPOCH_KEY)).toBe(String(SESSION_EPOCH));
  });

  it('retries on the next launch when the forced logout fails for lack of network', () => {
    localStorage.setItem(EPOCH_KEY, String(SESSION_EPOCH - 1));
    const { auth, ctrl } = setup();
    let failure: unknown;
    auth.ensureLoaded().subscribe({ error: (e: unknown) => (failure = e) });

    ctrl.expectOne(`${AUTH}/me`).flush(USER);
    ctrl.expectOne(`${AUTH}/logout`).error(new ProgressEvent('error'));

    expect(failure).toBeDefined(); // → OfflinePage
    expect(localStorage.getItem(EPOCH_KEY)).toBe(String(SESSION_EPOCH - 1));
  });

  it('marks a fresh login as current so the next launch keeps it', () => {
    localStorage.setItem(EPOCH_KEY, String(SESSION_EPOCH - 1));
    const { auth, ctrl } = setup();
    auth.login({ email: 'a@b.fr', password: 'x' } as never).subscribe();
    ctrl.expectOne(`${AUTH}/login`).flush(USER);
    expect(localStorage.getItem(EPOCH_KEY)).toBe(String(SESSION_EPOCH));
  });
});
