// Playwright e2e only (see playwright.config.ts and e2e/) — same as
// environment.ts, but pointed at the throwaway backend Playwright starts on
// :3100, so an e2e run never collides with (or depends on) whatever already
// listens on the usual dev port.
export const environment = {
  apiBaseUrl: 'http://localhost:3100/api',
  pushNotificationsAvailable: false,
  googleWebClientId: '',
  googleIosClientId: '',
};
