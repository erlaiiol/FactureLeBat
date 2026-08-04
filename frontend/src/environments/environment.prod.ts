export const environment = {
  apiBaseUrl: '/api',
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
  googleWebClientId: '522849402842-im45kelpe7oin95e6j3mn764p13vcb3b.apps.googleusercontent.com',
};
