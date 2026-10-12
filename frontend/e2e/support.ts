import { test as base, expect, type BrowserContext, type Page, type Route } from '@playwright/test';

export type E2ePlatform = 'web' | 'android' | 'ios';

export const API = 'http://localhost:3100/api';
export const STRIPE_CHECKOUT_URL = 'https://checkout.stripe.com/c/pay/cs_test_e2e';
export const APPLE_PRODUCT_IDS: Record<string, string> = {
  ESSENTIEL: 'net.facturele.app.essentiel.monthly',
  PRO: 'net.facturele.app.pro.monthly',
  PREMIUM: 'net.facturele.app.premium.monthly',
};

interface NativeCall {
  plugin: string;
  method: string;
  options: unknown;
}

// Makes the real web bundle believe it runs inside the Capacitor shell of
// the given platform, before any app script loads. CapacitorCustomPlatform
// is @capacitor/core's own hook for this: getPlatform() returns its name, so
// PlatformService.isIosApp()/isNativeApp() flip exactly as on a device,
// while every plugin that ships a web implementation keeps using it. The
// one native-only plugin the pipeline needs — the local StoreKitPurchase
// plugin (ios/App/App/Plugins/) — is declared through PluginHeaders, which
// routes its calls to Capacitor.nativePromise: stubbed here to record the
// call and answer like a successful App Store purchase sheet.
async function installNativeShell(context: BrowserContext, platform: E2ePlatform): Promise<void> {
  if (platform === 'web') {
    return;
  }
  await context.addInitScript((platformName) => {
    const win = window as unknown as Record<string, unknown>;
    const calls: NativeCall[] = [];
    win['__e2eNativeCalls'] = calls;
    win['CapacitorCustomPlatform'] = { name: platformName, plugins: {} };
    win['Capacitor'] = {
      PluginHeaders: [
        {
          name: 'StoreKitPurchase',
          methods: [
            { name: 'purchase', rtype: 'promise' },
            { name: 'restorePurchases', rtype: 'promise' },
            { name: 'getActiveEntitlements', rtype: 'promise' },
            { name: 'addListener', rtype: 'callback' },
          ],
        },
      ],
      nativePromise: (plugin: string, method: string, options: unknown) => {
        calls.push({ plugin, method, options });
        if (method === 'purchase') {
          return Promise.resolve({ transactionJWS: 'e2e.storekit.jws' });
        }
        return Promise.resolve({ transactions: [] });
      },
      nativeCallback: (plugin: string, method: string, options: unknown) => {
        calls.push({ plugin, method, options });
        return 'e2e-callback-id';
      },
    };
  }, platform);
}

export function nativeCalls(page: Page): Promise<NativeCall[]> {
  return page.evaluate(
    () => (window as unknown as { __e2eNativeCalls?: NativeCall[] }).__e2eNativeCalls ?? [],
  );
}

// Stripe and Apple are the only external systems faked: what's asserted is
// that the app *reaches* them (a Checkout redirect, a StoreKit purchase
// sheet + backend verification), not their own behavior. Everything else
// — the free-invoice gate, the 402, the trial-offer window — is the real
// local backend. The backend's own Stripe/Apple handling is covered with
// the same fakes in backend/test/first-invoice-subscription.e2e-spec.ts.
async function installPaymentFakes(context: BrowserContext): Promise<void> {
  // Same view a fully configured production backend would give.
  await patchBillingStatus(context, {});
  await context.route(`${API}/billing/plans`, (route) =>
    patchJsonResponse<{ plans: Record<string, unknown>[] }>(route, (body) => ({
      ...body,
      plans: body.plans.map((plan) => ({
        ...plan,
        available: true,
        appleProductId: APPLE_PRODUCT_IDS[plan['tier'] as string],
      })),
    })),
  );
  await context.route(`${API}/billing/checkout-session`, (route) =>
    corsFulfill(route, { url: STRIPE_CHECKOUT_URL }),
  );
  await context.route(`${API}/billing/apple/verify-purchase`, (route) =>
    corsFulfill(route, { tier: 'PREMIUM' }),
  );
  await context.route('https://checkout.stripe.com/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Stripe Checkout</title><h1>Stripe Checkout (e2e stub)</h1>',
    }),
  );
}

// GET /billing/status as a fully configured production backend would
// answer it, plus any per-test override (e.g. an expired trial offer).
// Registering it again replaces the previous handler (latest route wins).
export async function patchBillingStatus(
  context: BrowserContext,
  overrides: Record<string, unknown>,
): Promise<void> {
  await context.route(`${API}/billing/status`, (route) =>
    patchJsonResponse<Record<string, unknown>>(route, (body) => ({
      ...body,
      stripeConfigured: true,
      appleConfigured: true,
      ...overrides,
    })),
  );
}

// Forwards the request to the real backend and rewrites its JSON body.
// A request still in flight when the test ends (e.g. /abonnement's status
// refresh right after a purchase) has its response disposed with the
// context — nothing left to fulfill then, so that's swallowed rather than
// failing an already-finished test.
async function patchJsonResponse<T>(route: Route, patch: (body: T) => unknown): Promise<void> {
  try {
    const response = await route.fetch();
    const body = (await response.json()) as T;
    await route.fulfill({ response, json: patch(body) });
  } catch (error) {
    if (!String(error).includes('disposed') && !String(error).includes('closed')) {
      throw error;
    }
  }
}

// A request to :3100 from the :4300 page is cross-origin with credentials —
// a hand-made response has to carry the same CORS headers the real backend
// would, or the browser discards it.
function corsFulfill(route: Route, json: unknown): Promise<void> {
  return route.fulfill({
    status: 201,
    json,
    headers: {
      'access-control-allow-origin': 'http://localhost:4300',
      'access-control-allow-credentials': 'true',
    },
  });
}

export const test = base.extend<{ platform: E2ePlatform }>({
  platform: ['web', { option: true }],
  context: async ({ context, platform }, use) => {
    await installNativeShell(context, platform);
    await installPaymentFakes(context);
    await use(context);
  },
});

export { expect };

let accountCounter = 0;

// Real sign-up through the UI — lands on /factures/nouvelle, where a brand
// new account is first asked "Activer les tutoriels ?". Answers it unless
// told not to (`tutorials: 'leave-open'`), so pipeline tests aren't driven
// through the 22-step guided tour.
export async function registerViaUi(
  page: Page,
  tutorials: 'Oui' | 'Non' | 'leave-open' = 'Non',
): Promise<void> {
  accountCounter += 1;
  await page.goto('/inscription');
  await page
    .locator('[formcontrolname=email]')
    .fill(`pw-${Date.now()}-${accountCounter}@example.com`);
  await page.locator('[formcontrolname=password]').fill('Motdepasse123');
  await page.locator('[formcontrolname=confirmPassword]').fill('Motdepasse123');
  await page.locator('[formcontrolname=acceptTerms]').check();
  await page.locator('button[type=submit]').click();
  await page.waitForURL('**/factures/nouvelle');
  await expect(optInDialog(page)).toBeVisible();
  if (tutorials !== 'leave-open') {
    await optInDialog(page).getByRole('button', { name: tutorials, exact: true }).click();
    await expect(optInDialog(page)).toBeHidden();
  }
}

export function optInDialog(page: Page) {
  return page.getByRole('dialog', { name: 'Activer les tutoriels' });
}

// Authenticated API call as the account the page is signed in as —
// BrowserContext.request shares the page's cookie jar; mutating calls also
// need the XSRF header CsrfGuard expects.
export async function api(page: Page, method: 'post' | 'patch', path: string, data: unknown) {
  const cookies = await page.context().cookies();
  const xsrf = cookies.find((cookie) => cookie.name === 'XSRF-TOKEN')?.value ?? '';
  const response = await page.context().request[method](`${API}${path}`, {
    headers: { 'X-XSRF-TOKEN': xsrf },
    data,
  });
  expect(response.ok(), `${method.toUpperCase()} ${path} → ${response.status()}`).toBe(true);
  return response;
}

export const FIRST_INVOICE_API_BODY = {
  customerName: 'Client E2E',
  lines: [{ description: 'Parquet E2E', unit: 'UNIT', quantity: 1, unitPriceCents: 1000 }],
};

// A customer and a product to pick from, plus the keyboard quantity input
// (the native shells default to the digit-wheel picker) — then reloads so
// the invoice draft store picks them up.
export async function seedCatalog(page: Page): Promise<void> {
  await api(page, 'post', '/customers', { name: 'Client E2E' });
  await api(page, 'post', '/products', { name: 'Parquet E2E', unit: 'UNIT', priceCents: 1000 });
  await api(page, 'patch', '/company/quantity-input-mode', { preferKeyboardQuantityInput: true });
  await page.goto('/factures/nouvelle');
}

// Mode rapide, through the real UI, up to the preview step — the point
// where the backend first decides whether this company may invoice
// (POST /invoices/preview is gated exactly like POST /invoices).
export async function fillGuidedInvoiceUpToPreview(
  page: Page,
  platform: E2ePlatform,
): Promise<void> {
  await page.getByText('Mode rapide', { exact: true }).click();
  await page.getByRole('button', { name: /Client E2E/ }).click();
  await page.waitForURL('**/rapide/lignes');
  await page.getByRole('button', { name: /ajouter un produit/i }).click();
  await page.getByRole('button', { name: /Parquet E2E/ }).click();
  const quantity = page.getByLabel(/Quantité/i).first();
  if (platform === 'web') {
    await quantity.fill('2');
  } else {
    // Native shells open a bottom sheet instead of an inline input — in
    // keyboard mode, thanks to seedCatalog's preferKeyboardQuantityInput.
    await quantity.click();
    const sheet = page.getByRole('dialog', { name: 'Choisir la quantité' });
    await sheet.locator('input').fill('2');
    await sheet.getByRole('button', { name: 'OK' }).click();
  }
  const vatQuestion = page.getByRole('button', { name: 'Auto-entrepreneur / Micro-entreprise' });
  if (await vatQuestion.isVisible()) {
    await vatQuestion.click();
  }
  await page.getByRole('button', { name: "Voir l'aperçu →" }).click();
}

export function trialOfferDialog(page: Page) {
  return page.getByRole('dialog', { name: 'Offre limitée dans le temps' });
}

export function paywallDialog(page: Page) {
  return page.getByRole('dialog', { name: 'Abonnement requis' });
}

// The two possible ends of the pipeline. Web/Android: a real browser
// navigation to Stripe Checkout, for the requested tier. iOS: Apple's
// StoreKit purchase sheet for that tier's App Store product, whose signed
// transaction is then handed to the backend for verification.
export async function expectStripeCheckout(page: Page, action: () => Promise<void>, tier: string) {
  const checkoutRequest = page.waitForRequest(`${API}/billing/checkout-session`);
  await action();
  expect((await checkoutRequest).postDataJSON()).toEqual({ tier });
  await page.waitForURL(STRIPE_CHECKOUT_URL);
  await expect(page.getByRole('heading', { name: /Stripe Checkout/ })).toBeVisible();
}

export async function expectAppStorePurchase(
  page: Page,
  action: () => Promise<void>,
  tier: string,
) {
  const verifyRequest = page.waitForRequest(`${API}/billing/apple/verify-purchase`);
  await action();
  expect((await verifyRequest).postDataJSON()).toEqual({
    signedTransactionInfo: 'e2e.storekit.jws',
  });
  const purchases = (await nativeCalls(page)).filter(
    (call) => call.plugin === 'StoreKitPurchase' && call.method === 'purchase',
  );
  expect(purchases).toEqual([
    {
      plugin: 'StoreKitPurchase',
      method: 'purchase',
      options: { productId: APPLE_PRODUCT_IDS[tier] },
    },
  ]);
  // Never a Stripe redirect from inside the iOS app.
  expect(page.url()).not.toContain('stripe.com');
}
