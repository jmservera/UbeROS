# Theme D — Runtime simulator selection

> Plan stub. Source of truth: [Simulation & Visualization PRD](../prds/003-uberos-simulation-visualization.md) §7.4.

## Scope — FR-D1 … FR-D4
- FR-D1 — `UBEROS_SIMULATORS` (control-plane registry) selects which simulators are installed and shown in the launch menu for a deployment. There are no compose profiles: the simulator services are always-on, and selection is runtime registry/menu gating.
- FR-D2 — Default install set is **Gazebo + Turtlesim**.
- FR-D3 — Excluding a simulator keeps its registry entry out of the menu and rejects its launch/stop requests in the control plane.
- FR-D4 — Documented in `.env`/compose comments and the README (default + how to change).

## Dependency / lane
- **Lane 4 (integrate last).** Depends on **Theme A** (registry) and the simulator services from **Themes C and F** existing.

## Likely files
- `services/control/simulators.js` (`UBEROS_SIMULATORS` registry gating)
- `compose.yaml` (`UBEROS_SIMULATORS` default), `.env.example`, README/docs

## Tasks
- [ ] Research: runtime registry/menu gating vs compose profiles; registry `enabled` gating
- [ ] Plan: selection mechanism + defaults + docs
- [ ] Implement: `UBEROS_SIMULATORS` registry gating (always-on services)
- [ ] Tests: include/exclude a simulator changes the menu + lifecycle
- [ ] Acceptance (PRD §7.4)
