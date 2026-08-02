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
  // android/app/build.gradle only applies the google-services Gradle plugin
  // (which is what actually calls FirebaseApp.initializeApp() at startup)
  // when android/app/google-services.json exists — itself only ever dropped
  // in by hand, see docs/deployment.md. Without it, PushNotifications.register()
  // (see push-registration.service.ts) throws an uncaught native
  // IllegalStateException that kills the whole app — a JS try/catch can't
  // reach it, since Capacitor's own Bridge.java re-throws any exception a
  // plugin method raises synchronously on its own handler thread, crashing
  // the process before it ever becomes a rejected promise. Ships false here
  // (safe default for a machine that hasn't done that one-time setup);
  // scripts/run-android.sh (dev mode) flips it to true when the file exists.
  pushNotificationsAvailable: false,
};
