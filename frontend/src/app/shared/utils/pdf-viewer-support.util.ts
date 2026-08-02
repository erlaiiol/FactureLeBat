// Safari (desktop) and every iOS browser (Apple requires them all to run on
// WebKit, regardless of what they're branded as — Chrome/Firefox on iOS are
// no exception) have a long-standing bug rendering a PDF inside
// `<iframe src="blob:...">` when that blob came from a fetch/XHR response
// rather than a direct navigation: the frame loads but stays blank, with no
// error surfaced anywhere. Chromium/Gecko don't have this problem, so the
// cheap native iframe stays the default there — see
// PdfPreviewModalComponent/InvoicePreviewModalComponent, which fall back to
// PdfCanvasViewerComponent (pdf.js, painted onto <canvas>) only when this
// returns true.
export function needsCanvasPdfViewer(userAgent: string = navigator.userAgent): boolean {
  const isIOS = /iPad|iPhone|iPod/i.test(userAgent);
  const isDesktopSafari =
    /safari/i.test(userAgent) && !/chrome|chromium|crios|edg|opr|android/i.test(userAgent);
  return isIOS || isDesktopSafari;
}
