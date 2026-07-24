# Theme B — Launch menu & simulator lifecycle

> Plan stub. Source of truth: [Simulation & Visualization PRD](../prds/uberos-simulation-visualization.md) §7.2.

## Scope — FR-B1 … FR-B8
- FR-B1 — Simulators menu lists installed simulators with per-sim state (available/starting/running/stopped/failed).
- FR-B2/B3 — `POST /control/simulators/{id}/launch` and `/stop` (allowlisted start/stop).
- FR-B4 — Launch routes the correct panel per transport (gzweb panel / noVNC iframe).
- FR-B5 — Concurrent simulators, tracked independently.
- FR-B6 — Server-side lifecycle survives browser reload; panel reconnects to the running sim.
- FR-B7 — Allowlisted start/stop only; no container create/exec via the Docker socket.
- FR-B8 — Configurable per-sim `autostart`; default both Gazebo and Turtlesim on.

## Dependency / lane
- **Lane 1 (foundation).** Depends on **Theme A** (registry + `GET /simulators`).
- Downstream: C-menu and F-menu wiring route through this lifecycle.

## Likely files
- `services/control/server.js` (launch/stop endpoints, autostart)
- `services/frontend/src/App.svelte` (menu), `services/frontend/src/lib/control.js`
- `compose.yaml` (`simulators` profile)

## Tasks
- [ ] Research: Docker start/stop via existing socket client; reconnect semantics
- [ ] Plan: endpoints + menu state machine + autostart config
- [ ] Implement: lifecycle endpoints, menu, reconnect, autostart
- [ ] Tests: allowlist 403, concurrent state, reload reconnect
- [ ] Acceptance (PRD §7.2)
