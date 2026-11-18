import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { ClientLogService } from './client-log.service';
import {
  PERIODIC_INTERVAL_MS,
  RESUME_MIN_INTERVAL_MS,
  SessionKeepAliveService,
} from './session-keepalive.service';

function setup(authenticated = true) {
  const auth = {
    isAuthenticated: signal(authenticated),
    currentUser: signal(authenticated ? { id: 'u_1' } : null),
    revalidate: vi.fn().mockReturnValue(of({ id: 'u_1' })),
  };
  const clientLog = { report: vi.fn(), scheduleFlush: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: auth },
      { provide: ClientLogService, useValue: clientLog },
    ],
  });
  return { service: TestBed.inject(SessionKeepAliveService), auth, clientLog };
}

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('SessionKeepAliveService', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    setVisibility('visible');
  });

  it('revalidates on resume once the min interval has passed', () => {
    const { service, auth } = setup();
    service.start();

    setVisibility('hidden');
    setVisibility('visible');
    expect(auth.revalidate).not.toHaveBeenCalled(); // boot just counted as a check

    vi.advanceTimersByTime(RESUME_MIN_INTERVAL_MS + 1);
    setVisibility('hidden');
    setVisibility('visible');
    expect(auth.revalidate).toHaveBeenCalledTimes(1);
  });

  it('revalidates periodically while in the foreground, not in the background', () => {
    const { service, auth } = setup();
    service.start();

    vi.advanceTimersByTime(PERIODIC_INTERVAL_MS);
    expect(auth.revalidate).toHaveBeenCalledTimes(1);

    setVisibility('hidden');
    vi.advanceTimersByTime(PERIODIC_INTERVAL_MS * 3);
    expect(auth.revalidate).toHaveBeenCalledTimes(1);
  });

  it('does nothing when logged out', () => {
    const { service, auth } = setup(false);
    service.check('periodic');
    expect(auth.revalidate).not.toHaveBeenCalled();
  });

  it('reports a dead session with the user it belonged to', () => {
    const { service, auth, clientLog } = setup();
    auth.revalidate.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 401, url: '/api/auth/refresh' })),
    );
    service.check('periodic');
    expect(clientLog.report).toHaveBeenCalledWith({
      kind: 'session_check',
      status: 401,
      message: 'periodic: session invalid (user u_1)',
    });
  });

  it('ignores a network failure (no signal says nothing about the session)', () => {
    const { service, auth, clientLog } = setup();
    auth.revalidate.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    service.check('periodic');
    expect(clientLog.report).not.toHaveBeenCalled();
  });
});
