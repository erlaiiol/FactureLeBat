import { Capacitor } from '@capacitor/core';

// Safari (desktop) and every iOS browser (Apple requires them all to run on
// WebKit, regardless of what they're branded as — Chrome/Firefox on iOS are
// no exception) have a long-standing bug rendering a PDF inside
// `<iframe src="blob:...">` when that blob came from a fetch/XHR response
// rather than a direct navigation: the frame loads but stays blank, with no
// error surfaced anywhere. Chromium/Gecko don't have this problem *as full
// browser apps* — but a Capacitor native shell doesn't run inside one: Android
// wraps a bare `android.webkit.WebView` and iOS a bare `WKWebView`, neither of
// which ships the browser's own PDF plugin. Same symptom as the iOS/Safari
// bug (blank frame, no error), so the same canvas fallback below covers it —
// and matches the report of the preview sometimes rendering nothing "surtout
// dans l'émulateur": emulator images are even less likely than a real device
// to have any system PDF intent handler installed as a backstop.
// Chromium/Gecko as full desktop/Android *browser* apps don't have this
// problem, so the cheap native iframe stays the default there — see
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
  const isDesktopSafari =
    /safari/i.test(userAgent) && !/chrome|chromium|crios|edg|opr|android/i.test(userAgent);
  return isIOS || isDesktopSafari;
}
