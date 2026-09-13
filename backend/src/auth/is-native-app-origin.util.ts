// The iOS app's WKWebView can never actually run under an `https://` origin
// (WKWebView reserves that scheme for its own native handling — see
// capacitor.config.ts's comment), so its real origin is always
// `capacitor://<hostname>` regardless of capacitor.config.ts's iosScheme
// setting. Shared by cookie.util.ts (sameSite relaxation — cross-site
// fetch/XHR never attaches a sameSite:'lax' cookie) and CsrfGuard (the
// double-submit cookie defense can't work here either: this same origin's
// WKWebView doesn't expose `document.cookie` for cookies set by the
// cross-scheme API response at all, confirmed empirically — not just this
// one cookie).
//
// Trusting the Origin header here doesn't weaken either check: only a real
// Capacitor WKWebView can present a `capacitor://` origin — no website can
// forge one — and CORS_ORIGIN must also explicitly allow it for the request
// to succeed at all. The classic CSRF vector (a malicious third-party page
// riding a victim's browser session) doesn't apply to a native app's own
// isolated WebView, which only ever loads our bundled app — there's no
// "other page" that could run script against this origin's cookie jar.
export function isNativeAppOrigin(origin: string | undefined): boolean {
  return origin?.startsWith('capacitor://') ?? false;
}
