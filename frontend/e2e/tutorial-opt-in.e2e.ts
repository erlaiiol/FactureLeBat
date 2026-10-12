import { expect, optInDialog, registerViaUi, test } from './support';

// The sign-up "Activer les tutoriels ?" prompt: the first thing a new
// account sees, before the first-invoice guided tour.
test.describe('Sign-up tutorial opt-in', () => {
  test('is asked before any tour, and "Oui" starts the first-invoice tour right away', async ({
    page,
  }) => {
    await registerViaUi(page, 'leave-open');
    await expect(page.getByText('Bienvenue sur FactureLe !')).toBeHidden();

    await optInDialog(page).getByRole('button', { name: 'Oui', exact: true }).click();

    // Heading, not getByText: the tour also mirrors each step into an
    // sr-only live region, which getByText would match a second time.
    await expect(page.getByRole('heading', { name: 'Bienvenue sur FactureLe !' })).toBeVisible();
    await expect(page.getByText(/Étape 1 \//)).toBeVisible();
  });

  test('"Non" turns the tutorials off for good, and is never asked again', async ({ page }) => {
    await registerViaUi(page, 'Non');
    await expect(page.getByText('Bienvenue sur FactureLe !')).toBeHidden();

    // Neither on reload, nor on another section that has its own tour.
    // networkidle: the prompt would only appear once the onboarding state
    // has loaded — asserting it's hidden any earlier proves nothing.
    await page.reload({ waitUntil: 'networkidle' });
    await expect(optInDialog(page)).toBeHidden();
    await page.goto('/clients', { waitUntil: 'networkidle' });
    await expect(optInDialog(page)).toBeHidden();
    await expect(page.getByText(/Étape 1 \//)).toBeHidden();

    await page.goto('/entreprise');
    await expect(
      page.getByRole('checkbox', { name: 'Activer les visites guidées' }),
    ).not.toBeChecked();
  });
});
