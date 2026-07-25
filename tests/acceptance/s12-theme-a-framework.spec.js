// S12 - Theme A framework deterministic evidence.
// Covers FR-A3 additive extensibility proof and FR-A4 launch/stop lifecycle
// evidence through ROS node graph visibility.
import { test, expect } from '@playwright/test';
import { execInService, ensureSimulatorNoVncReady } from '../helpers/stack.js';

async function getSimulators(request) {
  const res = await request.get('/control/simulators');
  expect(res.status()).toBe(200);
  const body = await res.json();
  return body.simulators ?? [];
}

function rosShell(command) {
  return `export ROS_DOMAIN_ID=${process.env.ROS_DOMAIN_ID || '42'} && export ROS_DISCOVERY_SERVER=${process.env.ROS_DISCOVERY_SERVER || 'discovery-server:11811'} && source /opt/ros/${process.env.ROS_DISTRO || 'kilted'}/setup.bash && ${command}`;
}

function rosNodeList() {
  try {
    return execInService('ros', `bash -lc '${rosShell('ros2 node list --no-daemon --spin-time 5')}'`)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

test.describe('S12 - Theme A framework deterministic evidence', () => {
  test('FR-A3: simulator menu renders an additive third registry entry without SPA edits', async ({ page, request }) => {
    const additive = {
      id: 'stage-sandbox',
      label: 'Stage Sandbox',
      service: 'stage-sandbox',
      transport: 'vnc',
      panelRoute: '/sim/stage-sandbox/novnc/',
      rosIntegration: 'native',
      autostart: false,
      enabled: true,
      state: 'stopped',
    };

    // Snapshot the real registry ONCE via the API request context, then serve a
    // deterministic augmented payload for every menu poll. The Simulators menu
    // polls GET /control/simulators on an interval, so re-fetching inside the
    // route handler (route.fetch() + response.text()) races the page teardown
    // and throws "Response has been disposed". Fulfilling every GET from a
    // pre-built static body (with the additive entry injected) is deterministic
    // and also sidesteps stale content-length/content-encoding headers.
    const base = await (await request.get('/control/simulators')).json();
    const simulators = Array.isArray(base.simulators) ? [...base.simulators] : [];
    if (!simulators.some((sim) => sim.id === additive.id)) {
      simulators.push(additive);
    }
    const payload = JSON.stringify({ ...base, simulators });

    await page.route('**/control/simulators', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: payload,
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: /Simulators/ }).click();

    const row = page.locator('.menu-service', { hasText: 'Stage Sandbox' });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.getByRole('button', { name: 'Launch' })).toBeVisible();
  });

  test('FR-A4: stop and launch are reflected in ROS graph node visibility', async ({ request }) => {
    test.setTimeout(240_000);

    const simulators = await getSimulators(request);
    const turtlesim = simulators.find((s) => s.id === 'turtlesim');
    test.skip(!turtlesim, 'turtlesim simulator is not installed in this build');

    const wasRunning = turtlesim.state === 'running';

    try {
      const stop = await request.post('/control/simulators/turtlesim/stop');
      // 404 => turtlesim container not created (simulators profile inactive);
      // the ROS-graph and relaunch assertions below could then only time out,
      // so skip with a clear reason. Otherwise require the documented 200.
      test.skip(stop.status() === 404, 'turtlesim container not created (simulators profile inactive)');
      expect(stop.status()).toBe(200);

      await expect
        .poll(async () => {
          const sims = await getSimulators(request);
          return sims.find((s) => s.id === 'turtlesim')?.state ?? 'missing';
        }, { timeout: 30_000 })
        .not.toBe('running');

      await expect
        .poll(() => rosNodeList(), { timeout: 30_000 })
        .not.toContain('/turtlesim');

      const launch = await request.post('/control/simulators/turtlesim/launch');
      expect(launch.status()).toBe(200);

      await expect
        .poll(async () => {
          const sims = await getSimulators(request);
          return sims.find((s) => s.id === 'turtlesim')?.state ?? 'missing';
        }, { timeout: 30_000 })
        .toMatch(/starting|running/);

      await ensureSimulatorNoVncReady(request, 'turtlesim', '/sim/turtlesim/novnc/');

      await expect
        .poll(() => rosNodeList(), { timeout: 120_000 })
        .toContain('/turtlesim');
    } finally {
      if (!wasRunning) {
        try {
          await request.post('/control/simulators/turtlesim/stop');
        } catch {
          // Best effort cleanup when the request context is being torn down.
        }
      }
    }
  });
});