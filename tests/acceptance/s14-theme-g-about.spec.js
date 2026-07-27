// S14 - The Help ▸ About dialog surfaces the running UbeROS version (Theme G,
// FR-G3). The menubar exposes an About entry; opening it shows a modal whose
// version field reflects GET /control/version. Machine-testable: the control
// endpoint returns a version and the About modal renders that same value.
import { test, expect } from '@playwright/test';

test.describe('S14 - About dialog shows the version', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.removeItem('uberos.layout.v1'));
    await page.goto('/');
    await expect(page.locator('.uberos-menubar')).toBeVisible({ timeout: 20_000 });
  });

  test('control /version returns a version string (FR-G1/FR-G2)', async ({ request }) => {
    const res = await request.get('/control/version');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.version).toBe('string');
    expect(body.version.length).toBeGreaterThan(0);
  });

  test('menubar exposes an About entry', async ({ page }) => {
    await expect(page.getByRole('button', { name: /^About$/ })).toBeVisible();
  });

  test('About dialog renders the control-plane version (FR-G3)', async ({ page, request }) => {
    const expected = (await (await request.get('/control/version')).json()).version;

    await page.getByRole('button', { name: /^About$/ }).click();

    const dialog = page.getByRole('dialog', { name: /About UbeROS/ });
    await expect(dialog).toBeVisible();

    const shown = dialog.getByTestId('about-version');
    await expect(shown).toBeVisible();
    await expect(shown).toHaveText(expected);
  });
});
