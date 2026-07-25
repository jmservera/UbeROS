// S12 - Theme A framework deterministic evidence.
// Covers FR-A3 additive extensibility proof and FR-A4 launch/stop lifecycle
// evidence through ROS node graph visibility.
import { test, expect } from '@playwright/test';
import { execInService } from '../helpers/stack.js';

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
  test('FR-A3: simulator menu renders an additive third registry entry without SPA edits', async ({ page }) => {
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

    await page.route('**/control/simulators', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      const body = JSON.parse(await response.text());
      const simulators = Array.isArray(body.simulators) ? body.simulators : [];
      if (!simulators.some((sim) => sim.id === additive.id)) {
        simulators.push(additive);
      }
      // Strip content-length/content-encoding from the reused headers: the body
      // below is modified (longer than the upstream response), so the original
      // content-length would mismatch and can truncate the read or hang the
      // browser; content-encoding would misdescribe the now-plain JSON body.
      const { 'content-length': _cl, 'content-encoding': _ce, ...safeHeaders } = response.headers();
      await route.fulfill({
        status: response.status(),
        headers: {
          ...safeHeaders,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ ...body, simulators }),
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: /Simulators/ }).click();

    const row = page.locator('.menu-service', { hasText: 'Stage Sandbox' });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.getByRole('button', { name: 'Launch' })).toBeVisible();
  });

  test('FR-A4: stop and launch are reflected in ROS graph node visibility', async ({ request }) => {
    test.setTimeout(120_000);

    const simulators = await getSimulators(request);
    const turtlesim = simulators.find((s) => s.id === 'turtlesim');
    test.skip(!turtlesim, 'turtlesim simulator is not installed in this build');

    const wasRunning = turtlesim.state === 'running';

    try {
      const stop = await request.post('/control/simulators/turtlesim/stop');
      expect([200, 404]).toContain(stop.status());

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
      expect([200, 404]).toContain(launch.status());

      await expect
        .poll(async () => {
          const sims = await getSimulators(request);
          return sims.find((s) => s.id === 'turtlesim')?.state ?? 'missing';
        }, { timeout: 30_000 })
        .toMatch(/starting|running/);

      await expect
        .poll(() => rosNodeList(), { timeout: 60_000 })
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