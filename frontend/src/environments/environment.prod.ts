export const environment = {
  apiBaseUrl: '/api',
  // A real release build is expected to have android/app/google-services.json
  // (and iOS's GoogleService-Info.plist + SPM dependency) already dropped in
  // by hand per docs/deployment.md — see environment.capacitor-dev.ts's own
  // comment for what happens if that manual step was skipped.
  pushNotificationsAvailable: true,
};
