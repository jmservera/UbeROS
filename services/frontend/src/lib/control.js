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

// Installed simulators + live state for the data-driven Simulators menu
// (FR-A2/FR-A3). Each entry is the registry contract (id, label, service,
// transport, panelRoute, rosIntegration, autostart, enabled) plus a live
// `state`.
export async function getSimulators() {
  try {
    const { simulators } = await json('/simulators');
    return { ok: true, simulators: simulators ?? [], error: '' };
  } catch (error) {
    return {
      ok: false,
      simulators: [],
      error: error instanceof Error ? error.message : 'control /simulators failed',
    };
  }
}

// Restart a single service (BR-007). Resolves when Docker reports the restart
// was issued; the caller polls getServices() to reflect recovery.
export async function restartService(name) {
  return json(`/services/${encodeURIComponent(name)}/restart`, { method: 'POST' });
}

// Launch an installed simulator (Theme B, FR-B2). Starts the simulator's
// container server-side; the caller opens the matching panel and polls
// getSimulators() to reflect the state transition (starting → running).
export async function launchSimulator(id) {
  return json(`/simulators/${encodeURIComponent(id)}/launch`, { method: 'POST' });
}

// Stop an installed simulator (Theme B, FR-B3). Halts the container server-side;
// the sim's ROS entities disappear and the caller polls getSimulators() to
// reflect the transition to stopped.
export async function stopSimulator(id) {
  return json(`/simulators/${encodeURIComponent(id)}/stop`, { method: 'POST' });
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
