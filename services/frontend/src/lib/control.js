// Client for the UberOS control plane (proxied at /control/). Backs the system
// menu's service-reset and auth-aware Logout actions (BR-007, BR-008). All calls
// are same-origin through the single proxy, so cached basic-auth credentials (if
// any) ride along automatically.

async function json(path, init) {
  const res = await fetch(`/control${path}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    ...init,
  });
  if (!res.ok) {
    throw new Error(`control ${path} failed (${res.status})`);
  }
  return res.json();
}

// Workspace config the SPA needs at boot: whether auth is on and which services
// may be reset. Falls back to safe defaults if the control plane is unreachable.
export async function getConfig() {
  try {
    return await json('/config');
  } catch {
    return { auth: 'off', services: [] };
  }
}

// Current per-service container health for the Services menu.
export async function getServices() {
  try {
    const { services } = await json('/services');
    return services ?? [];
  } catch {
    return [];
  }
}

// Restart a single service (BR-007). Resolves when Docker reports the restart
// was issued; the caller polls getServices() to reflect recovery.
export async function restartService(name) {
  return json(`/services/${encodeURIComponent(name)}/restart`, { method: 'POST' });
}
