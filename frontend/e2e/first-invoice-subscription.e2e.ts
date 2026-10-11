import {
  api,
  expect,
  expectAppStorePurchase,
  expectStripeCheckout,
  fillGuidedInvoiceUpToPreview,
  FIRST_INVOICE_API_BODY,
  paywallDialog,
  patchBillingStatus,
  registerViaUi,
  seedCatalog,
  test,
  trialOfferDialog,
} from './support';

// First invoice → subscription proposal → payment, on each shell the app
// ships in (playwright.config.ts's web/android/ios projects). Whatever path
// the artisan takes out of the free invoice, it has to end on a payment
// screen: Stripe Checkout on web and Android, the App Store purchase sheet
// on iOS — never a dead end, a "bientôt disponible", or (on iOS) a link out
// to a web price.
test.describe('First invoice → subscription', () => {
  test.beforeEach(async ({ page }) => {
    await registerViaUi(page, 'Non');
    await seedCatalog(page);
  });

  test('the first invoice is free, and is followed straight away by a subscription offer that ends in payment', async ({
    page,
    platform,
  }) => {
    await fillGuidedInvoiceUpToPreview(page, platform);
    await page.getByRole('button', { name: 'Créer la facture' }).click();

    const offer = trialOfferDialog(page);
    await expect(offer.getByText('Bravo pour votre 1ère facture !')).toBeVisible();

    if (platform === 'ios') {
      // The 1er-mois-à-2€ price only exists as a Stripe coupon: on iOS it is
      // neither shown nor linked to — the offer routes to the App Store.
      await expect(offer).not.toContainText('2 €');
      await expect(offer).not.toContainText('facturele.net');
      await offer.getByRole('button', { name: 'Voir les offres' }).click();
      await page.waitForURL('**/abonnement');
      await expectAppStorePurchase(
        page,
        () => page.getByRole('button', { name: 'Choisir Premium' }).click(),
        'PREMIUM',
      );
    } else {
      await expectStripeCheckout(
        page,
        () => offer.getByRole('button', { name: /Profiter de l’offre/ }).click(),
        'PREMIUM',
      );
    }
  });

  test('once the free invoice is used, the next one is blocked by a paywall that ends in payment', async ({
    page,
    platform,
  }) => {
    await api(page, 'post', '/invoices', FIRST_INVOICE_API_BODY);
    await page.reload();

    await fillGuidedInvoiceUpToPreview(page, platform);

    if (platform === 'ios') {
      const paywall = paywallDialog(page);
      await expect(paywall.getByText('Facture gratuite déjà utilisée')).toBeVisible();
      await expect(trialOfferDialog(page)).toBeHidden();
      await paywall.getByRole('button', { name: 'Voir les offres' }).click();
      await page.waitForURL('**/abonnement');
      await expectAppStorePurchase(
        page,
        () => page.getByRole('button', { name: 'Choisir Premium' }).click(),
        'PREMIUM',
      );
    } else {
      // The trial offer started by the first invoice is still running, so
      // the wall shows that offer rather than the generic paywall.
      const offer = trialOfferDialog(page);
      await expect(offer).toBeVisible();
      await expectStripeCheckout(
        page,
        () => offer.getByRole('button', { name: /Profiter de l’offre/ }).click(),
        'PREMIUM',
      );
    }
  });

  test('after the trial offer has expired, the paywall still ends in payment at the regular price', async ({
    page,
    platform,
  }) => {
    await api(page, 'post', '/invoices', FIRST_INVOICE_API_BODY);
    // Same status a company sees once its 48h trial-offer window is over.
    await patchBillingStatus(page.context(), { trialOffer: null });
    await page.reload();

    await fillGuidedInvoiceUpToPreview(page, platform);

    const paywall = paywallDialog(page);
    await expect(paywall.getByText('Facture gratuite déjà utilisée')).toBeVisible();
    await paywall.getByRole('button', { name: 'Voir les offres' }).click();
    await page.waitForURL('**/abonnement');

    const choosePremium = () => page.getByRole('button', { name: 'Choisir Premium' }).click();
    if (platform === 'ios') {
      await expectAppStorePurchase(page, choosePremium, 'PREMIUM');
    } else {
      await expectStripeCheckout(page, choosePremium, 'PREMIUM');
    }
  });
});
