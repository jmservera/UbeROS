// S7 - The system menu recovers, hides/shows, and rearranges panels.
// Covers BR-001 (reopen a closed panel), BR-003 (add a terminal), BR-005
// (hide/show windows), and BR-006 (predefined layouts). Machine-testable via
// the iframe panel count: simulator, terminal(s), and editor are iframes; the
// ROS status panel is not.
import { test, expect } from '@playwright/test';

const frames = (page) => page.locator('iframe.panel-frame');

test.describe('S7 - system menu manages the workspace', () => {
  test.beforeEach(async ({ page }) => {
    // Start from a known layout so counts are deterministic.
    await page.addInitScript(() => window.localStorage.removeItem('uberos.layout.v1'));
    await page.goto('/');
    await expect(frames(page).first()).toBeAttached({ timeout: 20_000 });
  });

  test('menubar exposes Panels, Layouts, and Services', async ({ page }) => {
    const menubar = page.locator('.uberos-menubar');
    await expect(menubar).toBeVisible();
    await expect(page.getByRole('button', { name: /Panels/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Layouts/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Services/ })).toBeVisible();
  });

  test('closing then reopening a panel restores it (BR-001/BR-005)', async ({ page }) => {
    const before = await frames(page).count();

    // Hide the Code Editor.
    await page.getByRole('button', { name: /Panels/ }).click();
    await page.getByRole('menuitemcheckbox', { name: /Code Editor/ }).click();
    await expect(frames(page)).toHaveCount(before - 1);

    // Reopen it from the same menu — a working panel of that type returns.
    await page.getByRole('button', { name: /Panels/ }).click();
    await page.getByRole('menuitemcheckbox', { name: /Code Editor/ }).click();
    await expect(frames(page)).toHaveCount(before);
  });

  test('add terminal spawns an additional panel (BR-003)', async ({ page }) => {
    const before = await frames(page).count();
    await page.getByRole('button', { name: /Panels/ }).click();
    await page.getByRole('menuitem', { name: /Add terminal/ }).click();
    await expect(frames(page)).toHaveCount(before + 1);
  });

  test('a predefined layout can be applied (BR-006)', async ({ page }) => {
    await page.getByRole('button', { name: /Layouts/ }).click();
    await page.getByRole('menuitem', { name: /Simulator enlarged/ }).click();
    // The simulator iframe is still present after rearranging.
    await expect(
      page.locator('iframe.panel-frame[src*="novnc"]').first()
    ).toBeAttached();
  });
});
