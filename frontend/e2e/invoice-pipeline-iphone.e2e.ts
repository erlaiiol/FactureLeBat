import type { Page } from '@playwright/test';
import { api, expect, registerViaUi, test } from './support';

// iPhone 15 Plus (430×932 CSS px, @3x) — the widest "regular" iPhone, where
// a side-by-side pair of inputs still pushed the second one past the right
// edge of the screen on the customer step.
test.use({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3 });

const SHOTS = process.env['E2E_SHOTS_DIR'];

// Every visible element whose right edge goes past the viewport — empty on a
// layout that fits the screen. Elements inside a horizontally scrollable or
// clipping ancestor are fine (that's an intentional scroller, not overflow).
function overflowingElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const clipped = (el: Element): boolean => {
      for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
        const overflowX = getComputedStyle(node).overflowX;
        if (overflowX !== 'visible') {
          return true;
        }
      }
      return false;
    };
    return [...document.body.querySelectorAll('*')]
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== 'hidden' &&
          style.position !== 'fixed' &&
          rect.right > width + 1 &&
          !clipped(el)
        );
      })
      .map((el) => {
        const label =
          el.getAttribute('formcontrolname') ??
          el.getAttribute('placeholder') ??
          el.textContent?.trim().slice(0, 40);
        return `<${el.tagName.toLowerCase()}> ${label ?? ''} (right=${Math.round(el.getBoundingClientRect().right)})`;
      });
  });
}

async function expectFitsScreen(page: Page, step: string): Promise<void> {
  // Route transitions and modal morphs slide/scale content in — measure the
  // settled layout, not a mid-animation frame. Infinite ones (skeletons,
  // spinners) never settle and don't move the layout, so they're skipped.
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== 'running' ||
          animation.effect?.getComputedTiming().endTime === Infinity,
      ),
  );
  if (SHOTS) {
    await page.screenshot({ path: `${SHOTS}/${step}.png`, fullPage: true });
  }
  expect(await overflowingElements(page), `${step}: elements past the right edge`).toEqual([]);
}

test.describe('Invoice pipeline on an iPhone 15 Plus', () => {
  test.skip(({ platform }) => platform !== 'ios', 'iOS shell only');

  test('first invoice: every step fits the screen; missing company details are filled in a modal without leaving the draft', async ({
    page,
  }) => {
    await registerViaUi(page, 'Non');
    await api(page, 'patch', '/company/quantity-input-mode', { preferKeyboardQuantityInput: true });
    await api(page, 'post', '/products', { name: 'Parquet E2E', unit: 'UNIT', priceCents: 1000 });
    await page.goto('/factures/nouvelle');
    await expectFitsScreen(page, '01-mode-choice');

    await page.getByText('Mode rapide', { exact: true }).click();
    await page.waitForURL('**/rapide/client**');
    await page.getByRole('button', { name: '+ Nouveau client' }).click();
    await page.locator('[formcontrolname=customerName]').fill('Client E2E');
    await page.locator('[formcontrolname=customerPhone]').fill('0612345678');
    await expectFitsScreen(page, '02-customer');
    await page.getByRole('button', { name: 'Suivant : lignes & prestations' }).click();
    await page.waitForURL('**/rapide/lignes');

    await page.getByRole('button', { name: /ajouter un produit/i }).click();
    await page.getByRole('button', { name: /Parquet E2E/ }).click();
    await page
      .getByLabel(/Quantité/i)
      .first()
      .click();
    const sheet = page.getByRole('dialog', { name: 'Choisir la quantité' });
    await sheet.locator('input').fill('2');
    await sheet.getByRole('button', { name: 'OK' }).click();
    await page.getByRole('button', { name: 'Auto-entrepreneur / Micro-entreprise' }).click();
    await expectFitsScreen(page, '03-lines');

    await page.getByRole('button', { name: "Voir l'aperçu →" }).click();
    await page.waitForURL('**/rapide/apercu');
    await expect(page.getByRole('button', { name: 'Créer la facture' })).toBeVisible();
    await expectFitsScreen(page, '04-preview');
    const numberInfo = page.locator('summary[aria-label="À propos du numéro"]');
    await numberInfo.click();
    await expect(page.getByText('Suggéré automatiquement')).toBeVisible();
    await expectFitsScreen(page, '04b-preview-number-info');
    await numberInfo.click();

    // A brand new account has no name/SIRET/address yet: the preview says
    // so, and completing them happens in place — no trip to "Mon entreprise".
    await page.getByRole('button', { name: 'Compléter mon profil' }).click();
    const modal = page.getByRole('dialog', { name: 'Informations manquantes' });
    await expect(modal.locator('[formcontrolname=siret]')).toBeVisible();
    await expectFitsScreen(page, '05-essentials-modal');
    await modal.locator('[formcontrolname=name]').fill('Menuiserie E2E');
    await modal.locator('[formcontrolname=siret]').fill('12345678901234');
    await modal.locator('[formcontrolname=addressLine1]').fill('1 rue du Test');
    await modal.locator('[formcontrolname=postalCode]').fill('75001');
    await modal.locator('[formcontrolname=city]').fill('Paris');
    await modal.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(modal).toBeHidden();

    await expect(page).toHaveURL(/rapide\/apercu/);
    await expect(page.getByText('Informations obligatoires manquantes')).toHaveCount(0);
    // The draft survived: same customer, nothing to re-enter.
    await expect(page.getByText('Client E2E').first()).toBeVisible();

    await page.getByRole('button', { name: 'Créer la facture' }).click();
    await expect(page.getByText(/Facture .* créée/i)).toBeVisible();
    await page.getByRole('button', { name: 'Plus tard' }).click();
    await expectFitsScreen(page, '06-created');
  });
});
