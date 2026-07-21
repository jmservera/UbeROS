// S1 - `docker compose up` starts all services without error.
// Machine-testable version (research report): every defined service is healthy
// and no container has exited non-zero; the proxy answers /healthz with 200.
import { test, expect } from '@playwright/test';
import { SERVICES, healthSnapshot } from '../helpers/stack.js';

test.describe('S1 - stack starts without error', () => {
  test('all nine services report healthy', () => {
    const health = healthSnapshot();
    for (const svc of SERVICES) {
      expect(health[svc], `service "${svc}" should be present`).toBeDefined();
      expect(health[svc], `service "${svc}" should be healthy`).toBe('healthy');
    }
  });

  test('proxy /healthz returns 200 "ok"', async ({ request }) => {
    const res = await request.get('/healthz');
    expect(res.status()).toBe(200);
    expect((await res.text()).trim()).toBe('ok');
  });
});
