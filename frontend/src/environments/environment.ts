export const environment = {
  apiBaseUrl: 'http://localhost:3000/api',
  // Never native (ng serve, web only) — PushRegistrationService already
  // short-circuits on Capacitor.isNativePlatform() before this ever matters.
  pushNotificationsAvailable: true,
  // Never read on web — GoogleNativeLoginService only runs under
  // Capacitor.isNativePlatform(), and ng serve's login page keeps the
  // existing browser-redirect Google flow (see environment.prod.ts's own
  // comment on this field for what it's actually for).
  googleWebClientId: '',
};
