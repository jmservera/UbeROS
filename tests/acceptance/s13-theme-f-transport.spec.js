// S13 - Theme F transport deterministic evidence.
// Verifies gzweb routing and explicit retirement of Gazebo noVNC semantics.
import { test, expect } from '@playwright/test';

test.describe('S13 - Theme F transport deterministic evidence', () => {
  test('FR-F4: simulator route uses gzweb transport and Gazebo noVNC path is retired', async ({ request, page }) => {
    const simRes = await request.get('/control/simulators');
    expect(simRes.status()).toBe(200);
    const body = await simRes.json();
    const simulators = body.simulators ?? [];
    const gazebo = simulators.find((s) => s.id === 'gazebo');
    test.skip(!gazebo, 'gazebo simulator is not installed in this build');

    expect(gazebo.transport).toBe('gzweb');
    expect(gazebo.panelRoute).toBe('/gzweb/');

    const gzweb = await request.get('/gzweb/');
    expect(gzweb.status()).toBe(200);

    const wsHandshake = await request.get('/gzweb/ws/');
    expect([400, 404, 426]).toContain(wsHandshake.status());

    const retiredNoVnc = await request.get('/sim/gazebo/novnc/', { maxRedirects: 0 });
    expect([200, 404, 502]).toContain(retiredNoVnc.status());
    if (retiredNoVnc.status() === 200) {
      const fallbackHtml = await retiredNoVnc.text();
      // Some proxy/frontend variants route unknown paths to the SPA shell.
      // Accept that only when the body is clearly not a noVNC endpoint.
      expect(fallbackHtml).not.toContain('noVNC');
      expect(fallbackHtml).toContain('<!doctype html');
    }

    await page.goto('/');
    await expect(page.locator('iframe.panel-frame[src*="/gzweb/"]').first()).toBeAttached({ timeout: 20_000 });
    await expect(page.locator('iframe.panel-frame[src*="/sim/gazebo/novnc/"]')).toHaveCount(0);
  });

  test('FR-F5: capture informative gzweb connection timing evidence with bounded threshold', async ({ page }) => {
    const started = Date.now();
    await page.goto('/gzweb/');
    await expect(page.locator('#stream-status')).toHaveText(/connected/i, { timeout: 30_000 });
    await expect(page.locator('#state')).toHaveText(/connected/i, { timeout: 30_000 });

    const elapsedMs = Date.now() - started;
    // Informative ceiling to keep deterministic CI signal while documenting
    // FR-F5 behavior in variable host environments.
    expect(elapsedMs).toBeLessThan(30_000);
  });
});