import { expect, registerViaUi, seedCatalog, test } from './support';

// A services-only invoice (pure main-d'œuvre, no product line) must reach the
// preview — it used to 400 on the backend's GUIDED "at least one line" rule —
// and small blocking errors must surface as a centered toast the artisan
// sees wherever they've scrolled.
test.describe('Services-only invoice', () => {
  test.beforeEach(async ({ page }) => {
    await registerViaUi(page, 'Non');
    await seedCatalog(page);
    await page.getByText('Mode rapide', { exact: true }).click();
    await page.getByRole('button', { name: /Client E2E/ }).click();
    await page.waitForURL('**/rapide/lignes');
  });

  test('an empty draft is blocked by a centered, auto-dismissing toast', async ({ page }) => {
    await page.getByRole('button', { name: "Voir l'aperçu →" }).click();

    const toast = page.getByRole('alert').filter({ hasText: 'Ajoutez au moins une ligne' });
    await expect(toast).toBeVisible();
    const box = (await toast.boundingBox())!;
    const viewport = page.viewportSize()!;
    const toastCenterY = box.y + box.height / 2;
    expect(Math.abs(toastCenterY - viewport.height / 2)).toBeLessThan(viewport.height * 0.15);
    expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(viewport.width * 0.1);
    await expect(toast).toHaveCSS('opacity', '1');

    await expect(toast).toBeHidden({ timeout: 6000 });
    await expect(page).toHaveURL(/rapide\/lignes/);
  });

  test('a single visible service line reaches the preview; "Répartie" is unavailable', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Ajouter une prestation' }).click();
    await page.getByRole('button', { name: '+ Nouvelle prestation' }).click();

    const name = page.getByRole('textbox', { name: /^Nom/ });
    await name.fill('Main-d’œuvre '.repeat(30));
    expect((await name.inputValue()).length).toBe(200);
    await expect(page.getByText('200 / 200')).toBeVisible();

    await page.getByRole('spinbutton', { name: /^Montant/ }).fill('150');
    await expect(
      page.getByRole('combobox', { name: /^Visibilité/ }).locator('option[value="REDISTRIBUTED"]'),
    ).toHaveJSProperty('disabled', true);

    const vatQuestion = page.getByRole('button', { name: 'Auto-entrepreneur / Micro-entreprise' });
    if (await vatQuestion.isVisible()) {
      await vatQuestion.click();
    }
    await page.getByRole('button', { name: "Voir l'aperçu →" }).click();
    await page.waitForURL('**/rapide/apercu');
    await expect(page.getByRole('button', { name: 'Créer la facture' })).toBeVisible();
    await expect(page.getByText("Impossible de calculer l'aperçu")).toHaveCount(0);
  });
});
