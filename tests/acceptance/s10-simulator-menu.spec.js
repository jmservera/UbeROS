// S10 - Simulator menu + lifecycle (PRD Themes A & B).
// The simulator registry (services/control/simulators.js) is exposed by the
// control plane at GET /control/simulators (installed simulators + live state),
// and the SPA renders a data-driven "Simulators" menu that lists each one with
// its state and a Launch/Stop action (FR-A2/A3, FR-B1..B6). This spec verifies
// the API contract, the menu rendering, and a real stop→launch state cycle.
import { test, expect } from '@playwright/test';
import { ensureSimulatorRunning } from '../helpers/stack.js';

// Poll the control plane until the named simulator reaches one of `states`.
async function pollSimulatorState(request, id, states, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let last = 'unknown';
  while (Date.now() < deadline) {
    const res = await request.get('/control/simulators');
    if (res.ok()) {
      const { simulators } = await res.json();
      const sim = simulators.find((s) => s.id === id);
      last = sim?.state ?? 'missing';
      if (states.includes(last)) return last;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return last;
}

test.describe('S10 - simulator menu and lifecycle', () => {
  test('GET /control/simulators lists gazebo and turtlesim with state', async ({ request }) => {
    const res = await request.get('/control/simulators');
    expect(res.status()).toBe(200);
    const { simulators } = await res.json();
    expect(Array.isArray(simulators)).toBe(true);

    const byId = Object.fromEntries(simulators.map((s) => [s.id, s]));
    for (const id of ['gazebo', 'turtlesim']) {
      expect(byId[id], `registry contains "${id}"`).toBeDefined();
      // Registry contract fields (PRD §9) plus the live state enrichment.
      expect(byId[id]).toMatchObject({ id, service: expect.any(String), transport: expect.any(String) });
      expect(typeof byId[id].state, `"${id}" has a state`).toBe('string');
    }
    // Transports reflect the new architecture: gazebo=gzweb, turtlesim=vnc.
    expect(byId.gazebo.transport).toBe('gzweb');
    expect(byId.turtlesim.transport).toBe('vnc');
  });

  test('the Simulators menu lists installed simulators', async ({ page }) => {
    await page.goto('/');
    const menuBtn = page.getByRole('button', { name: /Simulators/ });
    await expect(menuBtn).toBeVisible({ timeout: 20_000 });
    await menuBtn.click();

    const dropdown = page.locator('.menu-dropdown', { hasText: 'Installed simulators' });
    await expect(dropdown).toBeVisible();
    // Data-driven from getSimulators(); labels come straight from the registry.
    await expect(dropdown.getByText('Gazebo', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(dropdown.getByText('Turtlesim', { exact: true })).toBeVisible();
    // Each entry shows a Launch or Stop action reflecting its live state.
    await expect(dropdown.getByRole('button', { name: /Launch|Stop/ }).first()).toBeVisible();
  });

  test('stop then launch turtlesim transitions its state', async ({ request }) => {
    // Make sure it is up first so the transitions are meaningful.
    ensureSimulatorRunning('turtlesim');
    const running = await pollSimulatorState(request, 'turtlesim', ['running', 'starting']);
    expect(['running', 'starting']).toContain(running);

    // Stop via the control API (FR-B3) and watch it settle to stopped.
    const stop = await request.post('/control/simulators/turtlesim/stop');
    expect(stop.status()).toBe(200);
    expect((await stop.json()).stopped).toBe('turtlesim');
    const stopped = await pollSimulatorState(request, 'turtlesim', ['stopped']);
    expect(stopped, 'turtlesim reports stopped after Stop').toBe('stopped');

    // Launch it again (FR-B2) and watch it come back to running.
    const launch = await request.post('/control/simulators/turtlesim/launch');
    expect(launch.status()).toBe(200);
    expect((await launch.json()).launched).toBe('turtlesim');
    const back = await pollSimulatorState(request, 'turtlesim', ['running', 'starting']);
    expect(['running', 'starting'], 'turtlesim restarts after Launch').toContain(back);
  });

  test('an unknown simulator id is rejected', async ({ request }) => {
    const res = await request.post('/control/simulators/not-a-sim/launch');
    expect(res.status()).toBe(403);
  });
});
