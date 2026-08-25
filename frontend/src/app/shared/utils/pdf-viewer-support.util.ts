import { Capacitor } from '@capacitor/core';

// Safari (desktop) and every iOS browser (Apple requires them all to run on
// WebKit, regardless of what they're branded as — Chrome/Firefox on iOS are
// no exception) have a long-standing bug rendering a PDF inside
// `<iframe src="blob:...">` when that blob came from a fetch/XHR response
// rather than a direct navigation: the frame loads but stays blank, with no
// error surfaced anywhere. A Capacitor native shell has the same symptom for
// a different reason: Android wraps a bare `android.webkit.WebView` and iOS a
// bare `WKWebView`, neither of which ships the browser's own PDF plugin —
// matches the report of the preview sometimes rendering nothing "surtout
// dans l'émulateur", since emulator images are even less likely than a real
// device to have any system PDF intent handler installed as a backstop.
//
// Android *as a full Chrome browser app* was originally assumed clean here
// (unlike iOS, it isn't a WebKit-mandated engine) — wrong in practice:
// confirmed on a real Android phone, Chrome's own inline PDF viewer failed
// to load a `blob:` iframe src entirely (a visible broken-file icon, plus a
// `frame-src` CSP violation logged against an *empty* framed URL — Chrome's
// PDF plugin appears to briefly attempt framing nothing partway through
// resolving the blob before giving up). This isn't a one-off: mobile
// Chrome's inline PDF support for iframe-embedded `blob:` sources has been
// reported unreliable across versions for years (see the Chrome support
// forum threads on "iframe not render pdf in android device" and "cannot
// view inline PDFs in Chrome on Android phone, but can in Windows or on
// iPhone"). Same canvas fallback below covers it, same as iOS/Capacitor.
//
// Desktop Chromium/Gecko *do* stay on the cheap native iframe — see
// PdfPreviewModalComponent/InvoicePreviewModalComponent, which fall back to
// PdfCanvasViewerComponent (pdf.js, painted onto <canvas>) only when this
// returns true.
export function needsCanvasPdfViewer(
  userAgent: string = navigator.userAgent,
  isNativeApp: boolean = Capacitor.isNativePlatform(),
): boolean {
  if (isNativeApp) {
    return true;
  }
  const isIOS = /iPad|iPhone|iPod/i.test(userAgent);
  const isAndroid = /android/i.test(userAgent);
  const isDesktopSafari =
    /safari/i.test(userAgent) && !/chrome|chromium|crios|edg|opr|android/i.test(userAgent);
  return isIOS || isAndroid || isDesktopSafari;
}
