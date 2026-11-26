import type { Page } from '@playwright/test';
import { API, api, expect, registerViaUi, test } from './support';

// Real touch events (CDP), not synthetic DOM ones: a finger landing a few px
// inside one screen edge and dragging 150px inwards.
async function edgeSwipe(page: Page, side: 'left' | 'right'): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const { width, height } = page.viewportSize()!;
  const y = Math.round(height / 2);
  const startX = side === 'left' ? 4 : width - 4;
  const direction = side === 'left' ? 1 : -1;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: startX, y }],
  });
  for (let step = 1; step <= 10; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: startX + direction * step * 15, y }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

async function catalogNames(page: Page, path: '/customers' | '/products'): Promise<string[]> {
  const response = await page.context().request.get(`${API}${path}`);
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { name: string }[]).map((entity) => entity.name);
}

test.describe('Mode rapide in the native shell', () => {
  test.skip(({ platform }) => platform !== 'ios', 'native shell only (iOS project)');

  test.beforeEach(async ({ page }) => {
    await registerViaUi(page, 'Non');
    await api(page, 'patch', '/company/quantity-input-mode', { preferKeyboardQuantityInput: true });
    await page.goto('/factures/nouvelle');
    await page.getByText('Mode rapide', { exact: true }).click();
    await page.getByRole('button', { name: '+ Nouveau client' }).click();
  });

  test('customers and products are saved the moment they are asked for, before the invoice exists', async ({
    page,
  }) => {
    await page.locator('[formcontrolname=customerName]').fill('Client Immédiat');
    await page.locator('[formcontrolname=saveAsNewCustomer]').check();
    await expect(page.getByText('« Client Immédiat » enregistré')).toBeVisible();
    await expect.poll(() => catalogNames(page, '/customers')).toContain('Client Immédiat');
    await expect(page.getByText('✓ Client enregistré')).toBeVisible();

    await page.getByRole('button', { name: 'Suivant : lignes & prestations' }).click();
    await page.waitForURL('**/rapide/lignes');
    await page.getByRole('button', { name: /ajouter un produit/i }).click();
    await page.getByRole('button', { name: '+ Nouveau produit' }).click();
    await page.locator('[formcontrolname=description]').fill('Plinthe chêne');
    await page.locator('[formcontrolname=unitPriceEuros]').fill('12');
    await page.getByRole('button', { name: 'Cliquer pour enregistrer dans le catalogue' }).click();
    await expect(
      page.getByRole('button', { name: 'Enregistré dans votre catalogue' }),
    ).toBeVisible();
    await expect.poll(() => catalogNames(page, '/products')).toContain('Plinthe chêne');

    // Still editable, and an edit followed by "Valider" updates the same
    // catalog entry rather than creating a second one.
    const name = page.locator('[formcontrolname=description]');
    await expect(name).not.toHaveAttribute('readonly');
    await name.fill('Plinthe chêne massif');
    // Keyboard quantity mode (see beforeEach): a plain inline input.
    await page.locator('[formcontrolname=quantity]').fill('3');
    await page.getByRole('button', { name: 'Valider', exact: true }).first().click();
    await expect
      .poll(() => catalogNames(page, '/products'))
      .toEqual(expect.arrayContaining(['Plinthe chêne massif']));
    expect(await catalogNames(page, '/products')).not.toContain('Plinthe chêne');
  });

  test('a catalog limit is reported in a short toast, without blocking the invoice', async ({
    page,
  }) => {
    await page.route(`${API}/products`, (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 402,
            json: {
              error: 'CatalogLimitExceeded',
              message: 'Limite de 50 articles atteinte pour la formule Essentiel.',
            },
            headers: {
              'access-control-allow-origin': 'http://localhost:4300',
              'access-control-allow-credentials': 'true',
            },
          })
        : route.fallback(),
    );
    await page.locator('[formcontrolname=customerName]').fill('Client Limite');
    await page.getByRole('button', { name: 'Suivant : lignes & prestations' }).click();
    await page.waitForURL('**/rapide/lignes');
    await page.getByRole('button', { name: /ajouter un produit/i }).click();
    await page.getByRole('button', { name: '+ Nouveau produit' }).click();
    await page.locator('[formcontrolname=description]').fill('Produit refusé');
    await page.locator('[formcontrolname=unitPriceEuros]').fill('5');
    await page.getByRole('button', { name: 'Cliquer pour enregistrer dans le catalogue' }).click();

    // Bottom, low-key toast (role=status), not the blocking center one.
    const toast = page.getByRole('status').filter({ hasText: 'Limite de 50 articles atteinte' });
    await expect(toast).toBeVisible();
    await expect(toast).toBeHidden({ timeout: 6000 });
    await expect(page.getByRole('dialog', { name: 'Abonnement requis' })).toHaveCount(0);
  });

  test('edge swipes go back and forward through the steps, keeping what was typed', async ({
    page,
  }) => {
    await page.locator('[formcontrolname=customerName]').fill('Client Glissé');
    await page.locator('[formcontrolname=customerPhone]').fill('0611223344');
    await page.getByRole('button', { name: 'Suivant : lignes & prestations' }).click();
    await page.waitForURL('**/rapide/lignes');
    await page.getByRole('button', { name: /ajouter un produit/i }).click();
    await page.getByRole('button', { name: '+ Nouveau produit' }).click();
    await page.locator('[formcontrolname=description]').fill('Ligne en cours');

    // Nothing ahead yet: a right-edge swipe does nothing.
    await edgeSwipe(page, 'right');
    await expect(page).toHaveURL(/rapide\/lignes/);

    await edgeSwipe(page, 'left');
    await page.waitForURL('**/rapide/client**');
    await expect(page.locator('[formcontrolname=customerName]')).toHaveValue('Client Glissé');
    await expect(page.locator('[formcontrolname=customerPhone]')).toHaveValue('0611223344');

    await edgeSwipe(page, 'right');
    await page.waitForURL('**/rapide/lignes');
    await expect(page.locator('[formcontrolname=description]')).toHaveValue('Ligne en cours');

    // A vertical drag starting at the edge is a scroll, not a navigation.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 4, y: 600 }],
    });
    for (let step = 1; step <= 10; step += 1) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: 4 + step * 2, y: 600 - step * 20 }],
      });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/rapide\/lignes/);
  });
});
