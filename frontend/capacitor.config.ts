import { CapacitorConfig } from '@capacitor/cli';

// Phase 22: wraps the existing Angular build (webDir points at ng build's
// own production output, see angular.json) for iOS/Android — no separate
// mobile codebase. appId matches Xcode's bundle identifier / Android's
// applicationId, decided once with the user and not meant to change.
//
// server.hostname/androidScheme/iosScheme deliberately point at the real
// API domain instead of Capacitor's default capacitor://localhost, so the
// WebView's origin matches the API's — but this only actually holds on
// Android. Its WebView can genuinely serve local content under an
// `https://` origin, so with androidScheme: 'https' every request really is
// same-origin there, and this app's httpOnly, sameSite:'lax' auth cookies
// (backend/src/auth/cookie.util.ts) flow unchanged.
//
// iOS's WKWebView can't do the same trick — it reserves the `https`/`http`
// schemes for its own native handling and silently falls back to
// `capacitor://<hostname>` no matter what iosScheme says (see
// node_modules/@capacitor/ios/.../CAPInstanceDescriptor.swift's
// normalize()). So on iOS this config only fixes the *hostname* half; the
// app's real origin is `capacitor://facturele.net`, genuinely cross-site
// from the API's `https://facturele.net` — environment.prod.ts's
// resolveApiBaseUrl calls the API by absolute URL instead of relying on
// same-origin relative resolution, and cookie.util.ts's sameSiteFor relaxes
// that one origin to sameSite:'none' (CORS_ORIGIN on the real server must
// list it too — infra/.env.example).
//
// TODO: confirm facturele.net is the final production domain before
// shipping to either store — no live domain exists yet as of this phase
// (infra/.env still has DOMAIN=:80). Grep this exact comment/TODO if the
// domain changes.
const PROD_HOSTNAME = 'facturele.net';

// Local Xcode/Android Studio simulator testing against a backend running
// on the developer's own machine can't point at a real TLS domain — set
// CAPACITOR_LOCAL_HOST to that machine's LAN IP (e.g. via
// `ipconfig getifaddr en0` on macOS) before `npx cap sync`/`npx cap run`,
// e.g.:
//   CAPACITOR_LOCAL_HOST=192.168.1.23 npx cap sync
// This needs a matching iOS ATS exception for that host in Info.plist
// (ios/App/App/Info.plist, ships commented as dev-only) and ../backend's
// CORS_ORIGIN to include this origin for local API calls: for Android,
// http://<that-ip>:3000 (server.hostname doesn't carry a port, but that's
// what its real same-origin request actually targets); for iOS,
// capacitor://<that-ip> (its WKWebView's real origin regardless of
// iosScheme — see the comment on server below), NOT the :3000 API URL
// itself — environment.prod.ts's resolveApiBaseUrl already appends
// :3000 when constructing that absolute URL from this same hostname.
const localHost = process.env.CAPACITOR_LOCAL_HOST;

// Opt-in remote debugging (chrome://inspect on the machine the phone is
// USB-connected to — shows this WebView's real Console/Network tabs) — off
// by default even on a release build type, since Capacitor only reads this
// from config (not BuildConfig.DEBUG) once explicitly set. Never set for a
// real `android-bundle` Play Store build; only for a one-off diagnostic
// sideload:
//   CAPACITOR_DEBUG=1 make android-prod
const debugWebContents = process.env.CAPACITOR_DEBUG === '1';

const config: CapacitorConfig = {
  appId: 'fr.facturele.app',
  appName: 'FactureLe',
  webDir: 'dist/frontend/browser',
  server: localHost
    ? { hostname: localHost, androidScheme: 'http', iosScheme: 'http' }
    : { hostname: PROD_HOSTNAME, androidScheme: 'https', iosScheme: 'https' },
  android: {
    webContentsDebuggingEnabled: debugWebContents,
  },
  plugins: {
    // Only Google sign-in is wired up (see GoogleNativeLoginService) —
    // disabling the other providers keeps their SDKs (and Facebook's
    // AD_ID-permission baggage, see the plugin's own README troubleshooting
    // section) out of the shipped APK entirely rather than bundled unused.
    SocialLogin: {
      providers: {
        google: true,
        facebook: false,
        apple: false,
        twitter: false,
      },
    },
  },
};

export default config;
