import { expect, registerViaUi, seedCatalog, test } from './support';

// A modal opened mid-step (the native shells' quantity bottom sheet) used to
// sit under the tour's dimmed backdrop and card, its OK button unreachable.
test.describe('Guided tour and modals', () => {
  test('steps aside for the quantity sheet, then comes back', async ({ page, platform }) => {
    test.skip(platform === 'web', 'the quantity bottom sheet only exists on the native shells');
    await registerViaUi(page, 'Oui');
    await seedCatalog(page);
    const title = page.getByRole('heading', { name: 'Bienvenue sur FactureLe !' });
    await expect(title).toBeVisible();

    await page.getByRole('button', { name: 'Suivant' }).click();
    await expect(page.getByRole('heading', { name: 'Devis ou facture ?' })).toBeVisible();
    await page.getByRole('button', { name: 'Suivant' }).click();
    await expect(page.getByRole('heading', { name: 'Trois façons de facturer' })).toBeVisible();
    await page.getByText('Mode rapide', { exact: true }).click();
    await page.getByRole('button', { name: /Client E2E/ }).click();
    // "Suivant" presses "ajouter un produit" rather than skipping past it.
    await expect(page.getByRole('heading', { name: /Ajoutez un matériau/ })).toBeVisible();
    await page.getByRole('button', { name: 'Suivant' }).click();
    await page.getByRole('button', { name: /Parquet E2E/ }).click();
    const quantityStep = page.getByRole('heading', { name: 'Indiquez le métrage du chantier' });
    await expect(quantityStep).toBeVisible();

    await page
      .getByLabel(/Quantité/i)
      .first()
      .click();
    const sheet = page.getByRole('dialog', { name: 'Choisir la quantité' });
    await expect(quantityStep).toBeHidden();
    await sheet.locator('input').fill('2');
    await sheet.getByRole('button', { name: 'OK' }).click();

    await expect(sheet).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Une carte modifiable' })).toBeVisible();
  });
});
