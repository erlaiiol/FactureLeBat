import { defineConfig, devices } from '@playwright/test';
import type { E2ePlatform } from './e2e/support';

// Browser e2e suite (e2e/) — the frontend half of the first-invoice →
// subscription pipeline (backend half: backend/test/first-invoice-
// subscription.e2e-spec.ts) plus the sign-up "Activer les tutoriels ?"
// prompt. Same "local sanity check against the dev Postgres, not an
// isolated CI gate" convention as the backend e2e specs: it boots its own
// backend on :3100 and `ng serve --configuration e2e` on :4300 (see
// environment.e2e.ts), so it never depends on whatever already runs on the
// usual dev ports. Run with `npm run e2e` (Postgres from `make dev` must be up).
//
// One project per shell the app ships in. Android and iOS run the real web
// bundle in Chromium with Capacitor told it's on that platform (see
// e2e/support.ts's installNativeShell) — enough to drive every
// platform-branching code path (PlatformService), with the StoreKit2 sheet
// itself stubbed at the Capacitor bridge.
export default defineConfig<{ platform: E2ePlatform }>({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  // Every test registers its own fresh account, but they all share one
  // backend whose /auth/register is rate-limited — no parallel workers.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/.report' }]],
  outputDir: 'e2e/.results',
  use: {
    baseURL: 'http://localhost:4300',
    // index.dev.html's CSP only allows connect-src to the usual :3000 API.
    bypassCSP: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'web',
      use: { ...devices['Desktop Chrome'], platform: 'web' },
    },
    {
      name: 'android',
      use: { ...devices['Pixel 7'], platform: 'android' },
    },
    {
      name: 'ios',
      // Chromium with an iPhone viewport/UA, not WebKit: what's under test
      // is the app's own iOS branching, not Safari's engine.
      use: {
        ...devices['iPhone 14'],
        browserName: 'chromium',
        platform: 'ios',
      },
    },
  ],
  webServer: [
    {
      command: 'npm run start',
      cwd: '../backend',
      url: 'http://localhost:3100/api/billing/plans',
      env: { PORT: '3100', CORS_ORIGIN: 'http://localhost:4300' },
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      command: 'npx ng serve --configuration e2e --port 4300',
      url: 'http://localhost:4300',
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
