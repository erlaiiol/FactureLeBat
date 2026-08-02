// Phase 22 local dev only, same purpose/lifecycle as
// android/app/src/main/res/xml/network_security_config.xml — ships with an
// inert placeholder, patched in place by scripts/run-android.sh (dev mode)
// with the same CAPACITOR_LOCAL_HOST LAN IP passed to capacitor.config.ts,
// then reverted via `git checkout` on script exit.
//
// Needed as its own file (not just environment.prod.ts) because
// environment.prod.ts's apiBaseUrl is the relative '/api' — correct in real
// prod where the API shares the page's own origin/port, but wrong here: the
// Capacitor WebView's origin is http://<LOCAL_HOST> with no port (implicit
// :80), while the local backend listens on :3000. A relative URL would
// resolve to the wrong port and every request would fail to connect.
export const environment = {
  apiBaseUrl: 'http://REPLACE_WITH_CAPACITOR_LOCAL_HOST:3000/api',
};
