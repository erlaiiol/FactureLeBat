import { needsCanvasPdfViewer } from './pdf-viewer-support.util';

const CHROME_ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const CHROME_DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SAFARI_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const IOS_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IOS_CHROME_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1';

describe('needsCanvasPdfViewer', () => {
  it('is false for desktop Chrome running in a regular browser tab', () => {
    expect(needsCanvasPdfViewer(CHROME_DESKTOP_UA, false)).toBe(false);
  });

  it('is false for Chrome on Android running in a regular browser tab', () => {
    expect(needsCanvasPdfViewer(CHROME_ANDROID_UA, false)).toBe(false);
  });

  it('is true for desktop Safari (long-standing blob-in-iframe bug)', () => {
    expect(needsCanvasPdfViewer(SAFARI_DESKTOP_UA, false)).toBe(true);
  });

  it('is true for any iOS browser, including Chrome-on-iOS (all run on WebKit)', () => {
    expect(needsCanvasPdfViewer(IOS_SAFARI_UA, false)).toBe(true);
    expect(needsCanvasPdfViewer(IOS_CHROME_UA, false)).toBe(true);
  });

  // Regression: the Capacitor Android/iOS shell embeds a bare WebView with no
  // PDF plugin (unlike the full Chrome/Safari browser apps) — the iframe blob
  // preview rendered nothing, silently, especially in emulators. `isNativeApp`
  // must force the canvas fallback regardless of the WebView's own user agent.
  it('is true inside the Capacitor native shell even with a Chrome-Android user agent', () => {
    expect(needsCanvasPdfViewer(CHROME_ANDROID_UA, true)).toBe(true);
  });

  it('is true inside the Capacitor native shell even with a desktop Chrome user agent', () => {
    expect(needsCanvasPdfViewer(CHROME_DESKTOP_UA, true)).toBe(true);
  });
});
