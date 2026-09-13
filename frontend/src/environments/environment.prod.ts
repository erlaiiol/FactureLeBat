import { Capacitor } from '@capacitor/core';

// WKWebView reserves the `https`/`http` schemes for its own native handling
// and won't let Capacitor register a custom handler on them — so despite
// capacitor.config.ts's `iosScheme: 'https'` + `hostname: 'facturele.net'`,
// the iOS app's real WebView origin always ends up `capacitor://
// facturele.net` (see CAPInstanceDescriptor.swift's normalize(), which
// silently falls back to the "capacitor" scheme whenever the configured one
// is already WKWebView-native). A *relative* '/api/...' call from that page
// resolves against that same fake-https origin, which Capacitor treats as
// "same origin" and therefore serves locally instead of over the real
// network (WebViewAssetHandler.swift falls back to the bundled index.html
// for any path it doesn't recognize as a static asset) — the app never
// actually reaches the backend, and Angular's HttpClient chokes trying to
// JSON.parse the HTML it gets back instead ("Http failure during parsing").
// An absolute URL sidesteps the local scheme handler entirely. Android is
// unaffected (its WebView genuinely can serve under `https://`, matching
// capacitor.config.ts's androidScheme, so its relative '/api' calls are
// real same-origin requests) — this only branches for iOS. `hostname` below
// is still exactly what capacitor.config.ts's `server.hostname` set — only
// the *scheme* gets downgraded, never the host — so this reconstructs the
// real target (facturele.net in prod, or `make ios LOCAL_HOST=<ip>`'s LAN
// IP for local backend testing, matching run-ios.sh's own "API sur
// http://$LOCAL_HOST:3000" dev-mode assumption) without needing any
// Capacitor-internal API. See backend/src/auth/cookie.util.ts's sameSiteFor
// for the matching cookie-policy half of this fix — an absolute cross-site
// request needs `SameSite=None` to get its session cookie back at all.
function resolveApiBaseUrl(): string {
  if (Capacitor.getPlatform() !== 'ios') {
    return '/api';
  }
  const hostname = window.location.hostname;
  return hostname === 'facturele.net' ? `https://${hostname}/api` : `http://${hostname}:3000/api`;
}

export const environment = {
  apiBaseUrl: resolveApiBaseUrl(),
  // A real release build is expected to have android/app/google-services.json
  // (and iOS's GoogleService-Info.plist + SPM dependency) already dropped in
  // by hand per docs/deployment.md — see environment.capacitor-dev.ts's own
  // comment for what happens if that manual step was skipped.
  pushNotificationsAvailable: true,
  // Google Cloud's "Web application" OAuth client ID — the exact same value
  // as the backend's GOOGLE_CLIENT_ID (infra/.env). Not a secret (client IDs
  // are public identifiers; GOOGLE_CLIENT_SECRET is the part that must stay
  // server-side only), but still a real per-deployment value with no safe
  // default, so — same manual drop-in posture as google-services.json above
  // — it must be edited here before building for the store; see
  // docs/deployment.md. GoogleNativeLoginService passes this to the native
  // Sign-In SDK as `webClientId`, which is what makes the ID token's `aud`
  // claim match what AuthService.googleTokenLogin verifies server-side.
  googleWebClientId: '211973026193-40naqvlso1khcl3gtofs4et50lhi6htq.apps.googleusercontent.com',
};
