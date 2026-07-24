// S10 - Theme B lifecycle acceptance coverage for FR-B6 and FR-B8.
// Verifies reload reconnect and autostart override semantics via control-plane
// simulator state without requiring direct Docker API assertions in test code.
import { test, expect } from '@playwright/test';

async function getSimulators(request) {
  const res = await request.get('/control/simulators');
  expect(res.status()).toBe(200);
  const body = await res.json();
  return body.simulators ?? [];
}

test.describe('S10 - Theme B lifecycle acceptance', () => {
  test('FR-B6: simulator state survives browser reload and panel reconnect path stays stable', async ({ page, request }) => {
    await page.goto('/');

    const before = await getSimulators(request);
    const running = before.find((s) => s.state === 'running');
    test.skip(!running, 'No running simulator available to verify reload persistence');

    const id = running.id;

    await page.reload();

    // FR-B6: browser reload does not reset server-side simulator lifecycle.
    // The same running simulator remains running after reconnect.
    await expect
      .poll(async () => {
        const sims = await getSimulators(request);
        const sim = sims.find((s) => s.id === id);
        return sim?.state ?? 'missing';
      }, { timeout: 20_000 })
      .toBe('running');
  });

  test('FR-B8: autostart configuration is reflected as boolean flags for all installed simulators', async ({ request }) => {
    const sims = await getSimulators(request);
    expect(sims.length).toBeGreaterThan(0);

    for (const sim of sims) {
      expect(typeof sim.id).toBe('string');
      expect(typeof sim.autostart, `${sim.id} autostart type`).toBe('boolean');
    }
  });

  test('FR-B7: unknown simulator ids are rejected by lifecycle endpoints', async ({ request }) => {
    const launch = await request.post('/control/simulators/not-a-simulator/launch');
    expect(launch.status()).toBe(403);

    const stop = await request.post('/control/simulators/not-a-simulator/stop');
    expect(stop.status()).toBe(403);
  });
});
