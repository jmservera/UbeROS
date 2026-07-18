// S8 - Optional proxy authentication is real and toggleable (BR-010), and the
// health endpoint is never gated so the container healthcheck keeps working.
// The control plane reports the current auth mode to the SPA (BR-008).
import { test, expect } from '@playwright/test';

test.describe('S8 - auth toggle and health exemption', () => {
  test('/healthz is always reachable without credentials', async ({ request }) => {
    const res = await request.get('/healthz');
    expect(res.status()).toBe(200);
    expect((await res.text()).trim()).toBe('ok');
  });

  test('/control/config reports the auth mode', async ({ request }) => {
    const res = await request.get('/control/config');
    expect(res.status()).toBe(200);
    const cfg = await res.json();
    expect(cfg).toHaveProperty('auth');
    expect(['off', 'basic']).toContain(cfg.auth);
  });

  test('auth mode is consistent with the SPA root', async ({ request }) => {
    const cfg = await (await request.get('/control/config')).json();
    const root = await request.get('/', { maxRedirects: 0 });
    if (cfg.auth === 'off') {
      // No prompt: the SPA loads directly.
      expect(root.status()).toBe(200);
    } else {
      // Auth on: unauthenticated requests are challenged.
      expect(root.status()).toBe(401);
    }
    // The logout route always challenges so the browser drops credentials.
    const logout = await request.get('/logout');
    expect(logout.status()).toBe(401);
  });
});
