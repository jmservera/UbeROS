// UbeROS simulator registry (FR-A1).
//
// A tiny, data-only catalog describing every simulator UbeROS knows how to
// drive. Each entry is the registry contract the PRD defines (§9): a stable
// `id`, a human `label`, the compose `service` that runs it, the `transport`
// its stream uses (`gzweb` websocket or `vnc` noVNC), the `panelRoute` the
// single proxy exposes that stream on, its `rosIntegration` style (`native`
// DDS or a `ros_gz` bridge), and `autostart`/`enabled` flags.
//
// The catalog drives BOTH the control plane (GET /simulators, and later
// launch/stop in Theme B) and the data-driven frontend menu — adding a
// simulator is a registry entry plus a compose service, with no core UI edits
// (NFR-MAINT-1). This module has no side effects and no external deps, matching
// the control service's Node-built-ins-only posture.

// Full catalog, keyed by id. Frozen so a caller can never mutate the source of
// truth; installedSimulators() hands out shallow copies.
const CATALOG = Object.freeze({
  gazebo: Object.freeze({
    id: 'gazebo',
    label: 'Gazebo',
    service: 'gazebo',
    transport: 'gzweb',
    panelRoute: '/gzweb/',
    rosIntegration: 'ros_gz',
    autostart: true,
    enabled: true,
  }),
  turtlesim: Object.freeze({
    id: 'turtlesim',
    label: 'Turtlesim',
    service: 'turtlesim',
    transport: 'vnc',
    panelRoute: '/sim/turtlesim/novnc/',
    rosIntegration: 'native',
    autostart: true,
    enabled: true,
  }),
});

// Which simulators are installed in this deployment. Configurable via
// UBEROS_SIMULATORS (comma-separated ids), mirroring how UBEROS_SERVICES gates
// the resettable-service allowlist in server.js. Defaults to the whole catalog.
// Unknown ids are dropped (allowlist mindset) and only `enabled` entries are
// ever exposed, so a disabled simulator stays invisible even if listed.
//
// Auto-start (FR-B8) is configurable without editing this catalog: set
// UBEROS_SIMULATORS_AUTOSTART to a comma-separated id list to override which
// installed simulators auto-start at stack up. When it is unset OR empty, each
// entry's catalog `autostart` flag applies (default: both Gazebo and Turtlesim
// on). Providing a non-empty subset (e.g. `turtlesim`) auto-starts only those;
// the rest are created but left stopped until launched from the menu. An empty
// value counts as "no override" so the compose default (`${VAR:-}`) preserves
// the both-on default rather than silently auto-starting none.
export function installedSimulators() {
  const ids = (process.env.UBEROS_SIMULATORS || Object.keys(CATALOG).join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const autostartEnv = (process.env.UBEROS_SIMULATORS_AUTOSTART || '').trim();
  const autostartSet = autostartEnv
    ? new Set(
        autostartEnv
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      )
    : null;
  return ids
    .map((id) => CATALOG[id])
    .filter((sim) => sim && sim.enabled)
    .map((sim) => ({
      ...sim,
      autostart: autostartSet ? autostartSet.has(sim.id) : sim.autostart,
    }));
}
