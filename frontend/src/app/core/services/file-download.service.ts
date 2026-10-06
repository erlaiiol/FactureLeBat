import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { NativeFileShareService } from './native-file-share.service';
import { PlatformService } from './platform.service';
import { ToastService } from './toast.service';

// Native-shell downloads of authenticated API files (invoice PDF/Factur-X,
// quarterly report PDF/CSV). On the web, a plain `<a href="/api/…"
// target="_blank">` is fine — the new tab is the same browser, carrying the
// same httpOnly access_token cookie. Inside the Android/iOS shells it is
// not: `target="_blank"` hands the URL to the system browser, which has
// none of the WebView's cookies, so every such link came back as a raw
// `401 Unauthorized` JSON page (found in prod, 2026-10-06). Same story for
// `<a download>` on a blob URL, which the Android WebView silently ignores.
//
// Instead, on native: fetch through HttpClient (inside the WebView, so the
// cookie and every interceptor — 401 refresh, 402 paywall — apply), write
// the file to the app cache, and hand it to the OS share sheet, from which
// the artisan saves it (Fichiers, Drive…) or sends it on.
@Injectable({ providedIn: 'root' })
export class FileDownloadService {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);
  private readonly toastService = inject(ToastService);
  private readonly nativeFileShare = inject(NativeFileShareService);
  private readonly isNative = inject(PlatformService).isNativeApp();
  private readonly destroyRef = inject(DestroyRef);

  // Registered once from App's constructor. A bubble-phase document listener
  // runs after every anchor's own (click) handler, so a handler that already
  // called preventDefault() (company-essentials gate, Factur-X quota
  // paywall) is respected and the download is simply skipped.
  interceptApiLinks(): void {
    if (!this.isNative) {
      return;
    }
    const listener = (event: MouseEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      const anchor = (event.target as Element | null)?.closest?.('a');
      if (!anchor || !this.isApiUrl(anchor.href)) {
        return;
      }
      event.preventDefault();
      void this.download(anchor.href);
    };
    this.document.addEventListener('click', listener);
    this.destroyRef.onDestroy(() => this.document.removeEventListener('click', listener));
  }

  // For callers that used to window.open() an API URL themselves (the
  // company-essentials gate's "continue" callback).
  open(url: string): void {
    if (this.isNative && this.isApiUrl(url)) {
      void this.download(url);
    } else {
      window.open(url, '_blank');
    }
  }

  // Native: cache file + share sheet. Web: a regular blob download.
  async saveBlob(blob: Blob, fileName: string): Promise<void> {
    if (!this.isNative) {
      const url = URL.createObjectURL(blob);
      const anchor = this.document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      return;
    }
    await this.nativeFileShare.share(blob, fileName);
  }

  private async download(url: string): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.http.get(url, { responseType: 'blob', observe: 'response' }),
      );
      const fileName =
        this.fileNameFromDisposition(response.headers.get('Content-Disposition')) ??
        this.fallbackFileName(url, response.body?.type);
      await this.saveBlob(response.body as Blob, fileName);
    } catch (error) {
      // 402: premiumGateInterceptor already showed the paywall.
      if (error instanceof HttpErrorResponse && error.status === 402) {
        return;
      }
      this.toastService.error('Impossible de télécharger le fichier pour le moment.');
    }
  }

  private isApiUrl(href: string): boolean {
    if (!href) {
      return false;
    }
    const apiBase = new URL(environment.apiBaseUrl, window.location.href);
    const target = new URL(href, window.location.href);
    return target.origin === apiBase.origin && target.pathname.startsWith(apiBase.pathname);
  }

  private fileNameFromDisposition(header: string | null): string | null {
    return header?.match(/filename="?([^";]+)"?/)?.[1] ?? null;
  }

  private fallbackFileName(url: string, mimeType?: string): string {
    const extension = mimeType?.includes('csv') ? 'csv' : 'pdf';
    const segment = new URL(url, window.location.href).pathname.split('/').at(-2) ?? 'document';
    return `${segment}.${extension}`;
  }
}
