// Client for the UbeROS control plane (proxied at /control/). Backs the system
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

// System settings persisted server-side (Theme C, FR-C2). getSettings returns
// { user, version, schemaVersion, settings }; on failure it yields empty
// settings so the SPA falls back to its built-in defaults.
export async function getSettings() {
  try {
    return await json('/config/settings');
  } catch {
    return { user: 'default', version: 1, schemaVersion: 1, settings: {} };
  }
}

// Persist system settings server-side (FR-C2). The reserved `user` key lets a
// future multi-user model scope settings per user without a redesign (FR-C4).
export async function saveSettings(settings, user = 'default') {
  return json('/config/settings', {
    method: 'PUT',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ user, settings }),
  });
}
