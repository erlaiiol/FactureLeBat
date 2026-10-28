import { HttpInterceptorFn, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { authRefreshInterceptor } from '../interceptors/auth-refresh.interceptor';
import { credentialsInterceptor } from '../interceptors/credentials.interceptor';
import { timeoutInterceptor } from '../interceptors/timeout.interceptor';
import { AuthService } from './auth.service';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { FileDownloadService } from './file-download.service';
import { NativeFileShareService } from './native-file-share.service';
import { PlatformService } from './platform.service';
import { ToastService } from './toast.service';

// Pins the 2026-10-06 prod bug: inside the Android/iOS shells, a plain
// `<a href="/api/…/pdf" target="_blank">` reached the system browser with
// none of the WebView's cookies and came back as a raw 401 JSON page. On
// native, every API link must instead go through HttpClient (inside the
// WebView, cookie included) and be handed to the OS share sheet.
const PDF_URL = `${environment.apiBaseUrl}/invoices/abc/pdf`;

async function flushAsync(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function setup(isNative: boolean, interceptors: HttpInterceptorFn[] = []) {
  const nativeShare = { share: vi.fn().mockResolvedValue(undefined) };
  const toast = { error: vi.fn(), success: vi.fn(), info: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors(interceptors)),
      provideHttpClientTesting(),
      { provide: PlatformService, useValue: { isNativeApp: signal(isNative) } },
      { provide: NativeFileShareService, useValue: nativeShare },
      { provide: ToastService, useValue: toast },
    ],
  });
  const service = TestBed.inject(FileDownloadService);
  service.interceptApiLinks();
  return { service, nativeShare, toast, http: TestBed.inject(HttpTestingController) };
}

function clickLink(href: string, ownHandler?: (event: MouseEvent) => void): MouseEvent {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.target = '_blank';
  // A nested child is what actually receives the tap in the real templates
  // (`<a><app-big-button>…</app-big-button></a>`).
  const child = document.createElement('span');
  anchor.appendChild(child);
  if (ownHandler) {
    anchor.addEventListener('click', ownHandler);
  }
  document.body.appendChild(anchor);
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  child.dispatchEvent(event);
  anchor.remove();
  return event;
}

describe('FileDownloadService', () => {
  const originalApiBaseUrl = environment.apiBaseUrl;
  afterEach(() => {
    try {
      TestBed.inject(HttpTestingController).verify();
    } finally {
      TestBed.resetTestingModule();
      environment.apiBaseUrl = originalApiBaseUrl;
      vi.useRealTimers();
    }
  });

  describe('in a native shell', () => {
    it('refreshes an expired session when a production Android link resolves to an absolute URL', async () => {
      environment.apiBaseUrl = '/api';
      const refreshSession = vi.fn().mockReturnValue(of({}));
      TestBed.configureTestingModule({
        providers: [
          { provide: AuthService, useValue: { currentUser: signal(null), refreshSession } },
          { provide: Router, useValue: { url: '/documents', navigate: vi.fn() } },
        ],
      });
      const { http, nativeShare, toast } = setup(true, [
        credentialsInterceptor,
        authRefreshInterceptor,
      ]);
      const url = '/api/invoices/abc/pdf';
      clickLink(url);

      const request = http.expectOne(url);
      expect(request.request.withCredentials).toBe(true);
      request.flush(new Blob(), { status: 401, statusText: 'Unauthorized' });
      expect(refreshSession).toHaveBeenCalledTimes(1);
      http.expectOne(url).flush(new Blob(['%PDF-1.3'], { type: 'application/pdf' }));
      await flushAsync();

      expect(nativeShare.share).toHaveBeenCalledTimes(1);
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('reports a stalled download in production instead of waiting indefinitely', async () => {
      environment.apiBaseUrl = '/api';
      vi.useFakeTimers();
      const { http, toast } = setup(true, [timeoutInterceptor]);
      const url = '/api/invoices/abc/pdf';
      clickLink(url);
      const request = http.expectOne(url);

      await vi.advanceTimersByTimeAsync(20_000);

      expect(request.cancelled).toBe(true);
      expect(toast.error).toHaveBeenCalled();
    });

    it('keeps the query string when opening an absolute API URL in production', async () => {
      environment.apiBaseUrl = '/api';
      const { service, http, nativeShare } = setup(true);
      service.open(new URL('/api/invoices/abc/pdf?download=1', window.location.href).href);
      http.expectOne('/api/invoices/abc/pdf?download=1').flush(new Blob());
      await flushAsync();
      expect(nativeShare.share).toHaveBeenCalledTimes(1);
    });

    it('downloads an API link through HttpClient instead of leaving the WebView', async () => {
      const { nativeShare, http } = setup(true);

      const event = clickLink(PDF_URL);
      expect(event.defaultPrevented).toBe(true);

      const request = http.expectOne(PDF_URL);
      expect(request.request.responseType).toBe('blob');
      request.flush(new Blob(['%PDF-1.3'], { type: 'application/pdf' }), {
        headers: { 'Content-Disposition': 'attachment; filename="facture-F-000042.pdf"' },
      });
      await flushAsync();

      expect(nativeShare.share).toHaveBeenCalledWith(expect.any(Blob), 'facture-F-000042.pdf');
    });

    it("leaves the link alone when the anchor's own handler already cancelled it", () => {
      const { http } = setup(true);
      // e.g. the company-essentials gate or the Factur-X quota paywall.
      clickLink(PDF_URL, (event) => event.preventDefault());
      http.expectNone(PDF_URL);
    });

    it('still intercepts a link inside a container that stops click propagation', async () => {
      // e.g. the board row's actions <td (click)="$event.stopPropagation()">
      // or ModalMorphComponent's panel — the 2026-10-07 "Télécharger does
      // nothing on Android" bug.
      const { nativeShare, http } = setup(true);
      const container = document.createElement('div');
      container.addEventListener('click', (event) => event.stopPropagation());
      document.body.appendChild(container);
      const anchor = document.createElement('a');
      anchor.href = PDF_URL;
      anchor.target = '_blank';
      container.appendChild(anchor);

      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      anchor.dispatchEvent(event);
      container.remove();

      expect(event.defaultPrevented).toBe(true);
      http.expectOne(PDF_URL).flush(new Blob(['%PDF-1.3'], { type: 'application/pdf' }));
      await flushAsync();
      expect(nativeShare.share).toHaveBeenCalledTimes(1);
    });

    it('downloads once per tap, even when the same link is tapped repeatedly', () => {
      const { http } = setup(true);
      const anchor = document.createElement('a');
      anchor.href = PDF_URL;
      document.body.appendChild(anchor);
      anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      anchor.remove();

      const requests = http.match(PDF_URL);
      expect(requests).toHaveLength(2);
      requests.forEach((request) => request.flush(new Blob()));
    });

    it('does not intercept non-API links', () => {
      const { http } = setup(true);
      const event = clickLink('https://example.com/cgu');
      expect(event.defaultPrevented).toBe(false);
      http.expectNone(() => true);
    });

    it('routes programmatic opens of an API URL through the same download', async () => {
      const { service, nativeShare, http } = setup(true);
      service.open(PDF_URL);
      http.expectOne(PDF_URL).flush(new Blob(['%PDF-1.3'], { type: 'application/pdf' }));
      await flushAsync();
      expect(nativeShare.share).toHaveBeenCalledWith(expect.any(Blob), 'abc.pdf');
    });

    it('shows an error toast instead of a raw error page when the download fails', async () => {
      const { nativeShare, toast, http } = setup(true);
      clickLink(PDF_URL);
      http.expectOne(PDF_URL).flush(new Blob(), { status: 401, statusText: 'Unauthorized' });
      await flushAsync();
      expect(nativeShare.share).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalled();
    });

    it('stays silent on a 402 — the paywall interceptor already handled it', async () => {
      const { toast, http } = setup(true);
      clickLink(PDF_URL);
      http.expectOne(PDF_URL).flush(new Blob(), { status: 402, statusText: 'Payment Required' });
      await flushAsync();
      expect(toast.error).not.toHaveBeenCalled();
    });
  });

  describe('on the web', () => {
    it('lets API links navigate normally (same browser, same cookie)', () => {
      const { http } = setup(false);
      const event = clickLink(PDF_URL);
      expect(event.defaultPrevented).toBe(false);
      http.expectNone(PDF_URL);
    });

    it('opens programmatic API URLs in a new tab', () => {
      const { service } = setup(false);
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      service.open(PDF_URL);
      expect(open).toHaveBeenCalledWith(PDF_URL, '_blank');
      open.mockRestore();
    });
  });
});
