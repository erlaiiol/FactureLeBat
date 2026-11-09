import type { Page } from '@playwright/test';
import { createEmailVerificationToken } from './db';
import {
  api,
  expect,
  FIRST_INVOICE_API_BODY,
  fillGuidedInvoiceUpToPreview,
  loginViaUi,
  myReferralCode,
  paywallDialog,
  patchBillingStatus,
  registerViaUi,
  seedCatalog,
  test,
} from './support';

// Referral code → subscription consequences, through the real UI on each
// shell the app ships in. The business rules themselves (reward scaling by
// tier, the -30 % Stripe coupon and which discount wins at checkout,
// idempotency) are covered exhaustively on the backend in
// backend/test/referral.e2e-spec.ts; what is checked here is what an
// artisan can actually see and do: the shareable link, the sign-up field,
// and — once the filleul has confirmed their email — the parrain's blocked
// invoicing opening up and their "Parrainage" card counting the reward.
function parrainageCard(page: Page) {
  return page.locator('section', { has: page.getByRole('heading', { name: 'Parrainage' }) });
}

test.describe('Referral program', () => {
  test('the "Parrainage" card hands out a sign-up link whose code is prefilled, and typing one gets live feedback', async ({
    page,
    platform,
  }) => {
    await registerViaUi(page, 'Non');
    const code = await myReferralCode(page);

    await page.goto('/abonnement');
    if (platform === 'ios') {
      // Like the promo-code card, the referral card stays out of the iOS app
      // (the App Store forbids steering to anything but its own purchase) —
      // the code is still honored when typed or opened from a link.
      await expect(page.getByRole('heading', { name: 'Code promo' })).toBeHidden();
      await expect(page.getByRole('heading', { name: 'Parrainage' })).toBeHidden();
    } else {
      await expect(parrainageCard(page).locator('input[readonly]')).toHaveValue(
        new RegExp(`/inscription\\?ref=${code}$`),
      );
      await expect(
        parrainageCard(page).getByText('0 filleul(s) confirmé(s) — 0 jour(s)'),
      ).toBeVisible();
    }

    // The link as a prospective filleul sees it: signed out, code already in.
    await page.context().clearCookies();
    await page.goto(`/inscription?ref=${code}`);
    const field = page.locator('[formcontrolname=referralCode]');
    await expect(field).toHaveValue(code);
    if (platform !== 'web') {
      // Native shells also offer the detected code as an explicit choice.
      await expect(page.getByText('Code de parrainage détecté')).toBeVisible();
      await page.getByRole('button', { name: 'Utiliser ce code' }).click();
      await expect(field).toHaveValue(code);
    }

    await field.fill('ZZZZZZZZ');
    await expect(page.getByText('Code inconnu — vérifiez la saisie.')).toBeVisible();
    await field.fill(code);
    await expect(page.getByText(/Code valide/)).toBeVisible();
    await expect(page.getByText('Code inconnu')).toBeHidden();
  });

  // Known gap: the validity check only runs on valueChanges, so a code that
  // arrives prefilled from ?ref= gets no "Code valide" feedback until it is
  // edited. Flip to test() once register.page.ts validates the initial value.
  test.fixme('a code prefilled from the link is confirmed valid straight away', async ({
    page,
  }) => {
    await registerViaUi(page, 'Non');
    const code = await myReferralCode(page);
    await page.context().clearCookies();
    await page.goto(`/inscription?ref=${code}`);
    await expect(page.getByText(/Code valide/)).toBeVisible();
  });

  test('an unknown code never blocks sign-up', async ({ page }) => {
    await registerViaUi(page, 'Non', { referralCode: 'ZZZZZZZZ' });
    // The new account still gets a code of its own.
    expect(await myReferralCode(page)).toMatch(/^[A-Z2-9]{6,10}$/);
  });

  test('a filleul confirming their email unlocks the parrain’s blocked invoicing and shows in their Parrainage card', async ({
    page,
    platform,
  }) => {
    // Parrain: free invoice used up, no plan → the next one hits the paywall.
    const parrain = await registerViaUi(page, 'Non');
    await seedCatalog(page);
    await api(page, 'post', '/invoices', FIRST_INVOICE_API_BODY);
    // Whatever the shell, the wall is the generic paywall rather than the
    // 48h trial offer (see first-invoice-subscription.e2e.ts for that one).
    await patchBillingStatus(page.context(), { trialOffer: null });
    await page.reload();
    await fillGuidedInvoiceUpToPreview(page, platform);
    await expect(paywallDialog(page).getByText('Facture gratuite déjà utilisée')).toBeVisible();

    const code = await myReferralCode(page);
    await page.goto('/abonnement');
    await expect(page.getByText('Facture rapide gratuite utilisée')).toBeVisible();

    // Filleul signs up from the link — nothing changes for the parrain yet.
    await page.context().clearCookies();
    const filleul = await registerViaUi(page, 'Non', { referralCode: code });

    await loginViaUi(page, parrain);
    await page.goto('/abonnement');
    if (platform !== 'ios') {
      await expect(
        parrainageCard(page).getByText('0 filleul(s) confirmé(s) — 0 jour(s)'),
      ).toBeVisible();
    }
    await expect(page.getByText('Facture rapide gratuite utilisée')).toBeVisible();

    // The filleul opens the link of their verification email.
    await page.context().clearCookies();
    const token = await createEmailVerificationToken(filleul.email);
    await page.goto(`/verifier-email?token=${token}`);
    await expect(page.getByText('Votre adresse email est confirmée. Merci !')).toBeVisible();

    // Parrain again: +10 Premium days (no plan → the floor reward), shown
    // as an active Premium grant, and the guided invoice goes through.
    await loginViaUi(page, parrain);
    await page.goto('/abonnement');
    await expect(page.getByText('Premium actif')).toBeVisible();
    await expect(
      page.getByText(/Accès\s+Premium\s+offert \(code promo \/ parrainage/),
    ).toBeVisible();
    if (platform !== 'ios') {
      await expect(
        parrainageCard(page).getByText('1 filleul(s) confirmé(s) — 10 jour(s)'),
      ).toBeVisible();
    }

    await page.goto('/factures/nouvelle');
    await fillGuidedInvoiceUpToPreview(page, platform);
    await expect(page.getByRole('button', { name: 'Créer la facture' })).toBeVisible();
    await expect(paywallDialog(page)).toBeHidden();
  });
});
