export const environment = {
  apiBaseUrl: 'http://localhost:3000/api',
  // Never native (ng serve, web only) — PushRegistrationService already
  // short-circuits on Capacitor.isNativePlatform() before this ever matters.
  pushNotificationsAvailable: true,
};
