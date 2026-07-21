# Theme A — Pluggable simulator framework (registry + control API)

> Plan stub for parallel work. Source of truth: [Simulation & Visualization PRD](../prds/uberos-simulation-visualization.md) §7.1.

## Scope — FR-A1 … FR-A4
- FR-A1 — Simulator registry (server-side, `services/control`): `id`, `label`, `service`, `transport` (`gzweb`|`vnc`), `panelRoute`, `rosIntegration` (`native`|`ros_gz`), `autostart`, `enabled`.
- FR-A2 — `GET /control/simulators` returns installed simulators + live state (extend the `/services` pattern in `services/control/server.js`).
- FR-A3 — Frontend menu/panels data-driven from `GET /simulators` (extend `services/frontend/src/lib/panels.js` `PANEL_DEFS`).
- FR-A4 — Each launched simulator joins the shared `ROS_DOMAIN_ID` via the discovery server (no multicast).

## Dependency / lane
- **Lane 1 (foundation) — keystone.** No upstream deps. Themes B, C-menu, F-menu, and D consume this registry/API.

## Likely files
- `services/control/server.js` (+ registry module)
- `services/frontend/src/lib/panels.js`, `services/frontend/src/lib/control.js`

## Tasks
- [ ] Research: control-plane extension points + registry shape
- [ ] Plan: registry module + `GET /simulators` contract + data-driven menu
- [ ] Implement: registry, endpoint, data-driven panel/menu
- [ ] Tests: endpoint shape + menu renders from registry
- [ ] Acceptance (PRD §7.1)
