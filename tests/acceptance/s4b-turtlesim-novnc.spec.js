// S4b - Turtlesim GUI is visible in a noVNC panel (PRD Theme C).
// The `turtlesim` service (Xvfb + turtlesim_node + x11vnc + websockify) still
// uses noVNC and is served through the single proxy at /sim/turtlesim/novnc/.
//
// Machine-testable version: a non-blank frame appears within 30s and differs
// from all-black by more than 5% of pixels (turtlesim's canvas is a solid blue
// field with the turtle, so a live stream is well above the threshold).
import { test, expect } from '@playwright/test';
import { pollNonBlackRatio, ensureSimulatorRunning } from '../helpers/stack.js';

test.describe('S4b - Turtlesim via noVNC', () => {
  // Turtlesim is on-demand; make sure its container is up before we stream it.
  test.beforeAll(() => {
    ensureSimulatorRunning('turtlesim');
  });

  test('noVNC renders a non-blank Turtlesim frame within 30s', async ({ page }) => {
    // noVNC defaults its WebSocket to ws://host/websockify at the origin root,
    // which the single proxy routes to the frontend (not the simulator), so the
    // handshake fails. The panel pins `path` to the simulator's proxied
    // websockify endpoint; the test streams the same URL the SPA builds.
    await page.goto(
      '/sim/turtlesim/novnc/vnc.html?autoconnect=true&resize=scale&path=sim/turtlesim/novnc/websockify'
    );

    const canvas = page.locator('#noVNC_canvas, canvas').first();
    await expect(canvas).toBeVisible({ timeout: 30_000 });

    const ratio = await pollNonBlackRatio(page, 30_000, 0.05);
    expect(
      ratio,
      `non-black pixel ratio (${(ratio * 100).toFixed(1)}%) should exceed 5%`
    ).toBeGreaterThan(0.05);
  });
});
