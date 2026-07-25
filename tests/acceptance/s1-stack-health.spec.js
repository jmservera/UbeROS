// S1 - `docker compose up` starts all services without error.
// Machine-testable version (research report): every defined service is healthy
// and no container has exited non-zero; the proxy answers /healthz with 200.
import { test, expect } from '@playwright/test';
import { SERVICES, healthSnapshot } from '../helpers/stack.js';

test.describe('S1 - stack starts without error', () => {
  test('all seven services report healthy', async ({ request }) => {
    test.setTimeout(120_000);
    // Prior tests can intentionally stop simulators; reconcile to running so
    // this stack-health assertion remains independent and deterministic. Assert
    // the reconcile succeeded so a control-plane rejection (403) or missing
    // container (404) surfaces here rather than as an opaque health-poll timeout.
    const gazebo = await request.post('/control/simulators/gazebo/launch');
    expect(gazebo.status()).toBe(200);
    const turtlesim = await request.post('/control/simulators/turtlesim/launch');
    expect(turtlesim.status()).toBe(200);

    await expect
      .poll(
        () => {
          const health = healthSnapshot();
          return SERVICES.every((svc) => health[svc] === 'healthy');
        },
        { timeout: 100_000, intervals: [2000] }
      )
      .toBe(true);
  });

  test('proxy /healthz returns 200 "ok"', async ({ request }) => {
    const res = await request.get('/healthz');
    expect(res.status()).toBe(200);
    expect((await res.text()).trim()).toBe('ok');
  });
});
