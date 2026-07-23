// S4 - Simulator panel renders and receives live scene-state updates.
// Theme F moved Gazebo from noVNC pixels to a gzweb scene-state websocket.
// Machine-testable version: the self-hosted gzweb client reaches "connected"
// state and increments total message count above zero.
import { test, expect } from '@playwright/test';

test.describe('S4 - simulator panel stream', () => {
  test('gzweb client connects and receives scene-state frames', async ({ page }) => {
    await page.goto('/gzweb/');

    await expect(page.getByText('Scene-state stream connected.')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#state')).toHaveText(/connected/i, { timeout: 30_000 });

    await expect
      .poll(async () => Number((await page.locator('#count').textContent()) || '0'), {
        timeout: 30_000,
      })
      .toBeGreaterThan(0);
  });
});
