// S4 - Simulator panel renders and receives live scene-state updates.
// Theme F moved Gazebo from noVNC pixels to a gzweb scene-state websocket.
// Machine-testable version: the self-hosted gzweb client reaches "connected"
// state and #meta reports a positive model count (the client renders the scene
// model count, e.g. "3 models", as its deterministic liveness signal).
import { test, expect } from '@playwright/test';

test.describe('S4 - simulator panel stream', () => {
  test('gzweb client connects and receives scene-state frames', async ({ page }) => {
    // Sequential waits below can stack to 30s + 45s + 30s on a healthy but slow
    // host, which exceeds Playwright's 60s suite default. Set an explicit
    // per-test timeout with headroom for these waits.
    test.setTimeout(150_000);
    await page.goto('/gzweb/');

    await expect(page.locator('#state')).toHaveText(/connected/i, { timeout: 30_000 });
    await expect(page.locator('#scene canvas').first()).toBeVisible({ timeout: 45_000 });

    await expect
      .poll(async () => {
        const meta = ((await page.locator('#meta').textContent()) || '').trim();
        const match = meta.match(/(\d+)/);
        return match ? Number(match[1]) : 0;
      }, {
        timeout: 30_000,
      })
      .toBeGreaterThan(0);
  });
});
