import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { clientErrorReportInterceptor } from '../interceptors/client-error-report.interceptor';
import { ClientLogService } from './client-log.service';

const API = environment.apiBaseUrl;
const LOGS_URL = `${API}/client-logs`;

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([clientErrorReportInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  return {
    http: TestBed.inject(HttpClient),
    ctrl: TestBed.inject(HttpTestingController),
    service: TestBed.inject(ClientLogService),
  };
}

describe('ClientLogService + clientErrorReportInterceptor', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('reports a request that never reached the server, path only', () => {
    const { http, ctrl } = setup();
    http
      .post(`${API}/invoices/preview-data?x=secret`, { a: 1 })
      .subscribe({ error: () => undefined });
    ctrl.expectOne(`${API}/invoices/preview-data?x=secret`).error(new ProgressEvent('error'));

    vi.advanceTimersByTime(2_000);
    const report = ctrl.expectOne(LOGS_URL);
    expect(report.request.body).toMatchObject({
      platform: 'web',
      events: [{ kind: 'http_error', method: 'POST', url: '/invoices/preview-data', status: 0 }],
    });
    report.flush(null, { status: 204, statusText: 'No Content' });
    expect(localStorage.getItem('fl.pendingClientLogs')).toBeNull();
  });

  it('does not report 4xx (the server already logs those)', () => {
    const { http, ctrl } = setup();
    http.get(`${API}/customers`).subscribe({ error: () => undefined });
    ctrl.expectOne(`${API}/customers`).flush(null, { status: 404, statusText: 'x' });
    vi.advanceTimersByTime(2_000);
    ctrl.expectNone(LOGS_URL);
  });

  it('keeps events queued (and persisted) when the report itself fails, without reporting it', () => {
    const { ctrl, service } = setup();
    service.report({ kind: 'session_check', message: 'resume: session invalid' });
    vi.advanceTimersByTime(2_000);
    ctrl.expectOne(LOGS_URL).error(new ProgressEvent('error'));

    vi.advanceTimersByTime(2_000);
    ctrl.expectNone(LOGS_URL); // no self-report loop
    expect(JSON.parse(localStorage.getItem('fl.pendingClientLogs') ?? '[]')).toHaveLength(1);

    service.scheduleFlush();
    vi.advanceTimersByTime(2_000);
    ctrl.expectOne(LOGS_URL).flush(null, { status: 204, statusText: 'No Content' });
    expect(localStorage.getItem('fl.pendingClientLogs')).toBeNull();
  });
});
