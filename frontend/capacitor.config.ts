import { CapacitorConfig } from '@capacitor/cli';

// Phase 22: wraps the existing Angular build (webDir points at ng build's
// own production output, see angular.json) for iOS/Android — no separate
// mobile codebase. appId matches Xcode's bundle identifier / Android's
// applicationId, decided once with the user and not meant to change.
//
// server.hostname/androidScheme/iosScheme deliberately point at the real
// API domain instead of Capacitor's default capacitor://localhost —
// otherwise the WebView's origin and the API's origin are cross-site from
// the cookie/CORS perspective, and this app's httpOnly, sameSite:'lax'
// auth cookies (backend/src/auth/cookie.util.ts) are not reliably sent on
// cross-site fetch/XHR (lax mainly protects top-level navigations, not
// background API calls). Making the WebView's own origin equal to the API's
// origin keeps every request same-origin, so the existing cookie/CSRF setup
// works unchanged — no relaxation of sameSite/secure needed on the backend.
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
// CORS_ORIGIN to include http://<that-ip>:3000 for local API calls.
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
