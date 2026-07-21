// S4a - Gazebo GUI reaches the browser via gzweb (PRD Theme F).
// The retired noVNC pixel path is gone: the headless `gazebo` service runs
// `gz sim -s` plus a WebsocketServer on :9002, and the always-on `gzweb-client`
// static service serves a Three.js client at /gzweb/ that streams SCENE STATE
// (protobuf) over the /gzweb/ws/ WebSocket through the single proxy.
//
// Machine-testable version: the /gzweb/ client loads its shell, opens the
// scene-state WebSocket to /gzweb/ws/, and the SceneManager mounts a rendering
// <canvas> into #scene after the connection is established. We assert the
// client reports `connected` and a live canvas is present within a generous
// window (gazebo is on-demand and the client retries while it comes up).
import { test, expect } from '@playwright/test';

test.describe('S4a - Gazebo via gzweb', () => {
  test('gzweb client connects to /gzweb/ws/ and renders a canvas', async ({ page }) => {
    const wsUrls = [];
    page.on('websocket', (ws) => wsUrls.push(ws.url()));

    await page.goto('/gzweb/');

    // The client shell renders its status overlay (#state) immediately.
    const status = page.locator('#state');
    await expect(status).toBeVisible({ timeout: 15_000 });

    // The client opens the scene-state WebSocket THROUGH the proxy at /gzweb/ws/.
    await expect
      .poll(() => wsUrls.some((u) => /\/gzweb\/ws\//.test(u)), {
        message: 'gzweb client opens the /gzweb/ws/ scene-state WebSocket',
        timeout: 30_000,
      })
      .toBe(true);

    // Once the WebsocketServer handshake completes, SceneManager reports
    // `connected` and mounts its Three.js <canvas> into #scene.
    await expect(status).toHaveText(/connected/i, { timeout: 45_000 });
    await expect(page.locator('#scene canvas').first()).toBeVisible({ timeout: 45_000 });
  });
});
