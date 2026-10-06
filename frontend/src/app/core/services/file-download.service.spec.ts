import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
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

function setup(isNative: boolean) {
  const nativeShare = { share: vi.fn().mockResolvedValue(undefined) };
  const toast = { error: vi.fn(), success: vi.fn(), info: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
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
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();
  });

  describe('in a native shell', () => {
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
